(function () {
	var CONFIG = window.DOPRA || {};
	var form = document.getElementById('upload-form');
	if (!form) return;

	var dropzone = document.getElementById('dropzone');
	var input = document.getElementById('file-input');
	var list = document.getElementById('upload-list');
	var template = document.getElementById('upload-item-template');

	function ownerToken() {
		try {
			var token = localStorage.getItem('dopra-owner');
			if (!token) {
				token = randomId(16);
				localStorage.setItem('dopra-owner', token);
			}
			return token;
		} catch (e) {
			return randomId(16);
		}
	}

	function randomId(len) {
		var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		var out = '';
		var values = new Uint8Array(len);
		(window.crypto || window.msCrypto).getRandomValues(values);
		for (var i = 0; i < len; i++) out += chars[values[i] % chars.length];
		return out;
	}

	function humanSize(bytes) {
		if (!bytes) return '0 B';
		var units = ['B', 'KB', 'MB', 'GB', 'TB'];
		var i = Math.floor(Math.log(bytes) / Math.log(1024));
		return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + units[i];
	}

	function options() {
		var expiration = form.querySelector('[name="expiration"]');
		var password = form.querySelector('[name="password"]');
		var maxDownloads = form.querySelector('[name="maxDownloads"]');
		return {
			expiration: expiration ? expiration.value : 'never',
			password: password ? password.value : '',
			maxDownloads: maxDownloads ? maxDownloads.value : ''
		};
	}

	function addItem(file) {
		var node = template.content.firstElementChild.cloneNode(true);
		node.querySelector('.upload-name').textContent = file.name;
		node.querySelector('.upload-status').textContent = humanSize(file.size);
		list.appendChild(node);
		return node;
	}

	function setProgress(node, percent) {
		node.querySelector('.progress-bar').style.width = percent + '%';
	}

	function setStatus(node, text) {
		node.querySelector('.upload-status').textContent = text;
	}

	function showResult(node, data) {
		setProgress(node, 100);
		setStatus(node, 'Done');
		// Build the link from the page's own origin so it is always correct,
		// regardless of proxy headers or the domain the instance is served on.
		var url = window.location.origin + '/' + data.shortCode;
		var result = node.querySelector('.upload-result');
		var link = node.querySelector('.result-link');
		result.hidden = false;
		link.value = url;
		node.querySelector('.copy-link').addEventListener('click', function () {
			link.select();
			navigator.clipboard.writeText(url);
			this.textContent = 'Copied';
			var self = this;
			setTimeout(function () { self.textContent = 'Copy'; }, 1500);
		});
	}

	function showError(node, message) {
		setStatus(node, message || 'Failed');
		node.querySelector('.progress-bar').style.background = '#dc2626';
	}

	function uploadSingle(file, node) {
		var opts = options();
		var data = new FormData();
		data.append('expiration', opts.expiration);
		if (opts.password) data.append('password', opts.password);
		if (opts.maxDownloads) data.append('maxDownloads', opts.maxDownloads);
		data.append('ownerToken', ownerToken());
		data.append('file', file, file.name);

		var xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/upload');
		xhr.upload.onprogress = function (e) {
			if (e.lengthComputable) setProgress(node, Math.round((e.loaded / e.total) * 95));
		};
		xhr.onload = function () {
			handleResponse(xhr, node);
		};
		xhr.onerror = function () { showError(node, 'Network error'); };
		xhr.send(data);
	}

	function uploadChunked(file, node) {
		var opts = options();
		var chunkSize = CONFIG.chunkSize || 90 * 1024 * 1024;
		var total = Math.ceil(file.size / chunkSize);
		var uploadId = randomId(24);
		var index = 0;
		var uploadedBytes = 0;

		function next() {
			if (index >= total) return finalize();
			var start = index * chunkSize;
			var end = Math.min(file.size, start + chunkSize);
			var blob = file.slice(start, end);
			var data = new FormData();
			data.append('uploadId', uploadId);
			data.append('index', String(index));
			data.append('total', String(total));
			data.append('chunk', blob, 'chunk');

			var xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/upload/chunk');
			var chunkStart = uploadedBytes;
			xhr.upload.onprogress = function (e) {
				if (e.lengthComputable) setProgress(node, Math.round(((chunkStart + e.loaded) / file.size) * 95));
			};
			xhr.onload = function () {
				if (xhr.status >= 200 && xhr.status < 300) {
					uploadedBytes += blob.size;
					index++;
					next();
				} else {
					handleResponse(xhr, node);
				}
			};
			xhr.onerror = function () { showError(node, 'Network error'); };
			xhr.send(data);
		}

		function finalize() {
			setStatus(node, 'Finalizing…');
			var params = new URLSearchParams();
			params.set('uploadId', uploadId);
			params.set('total', String(total));
			params.set('name', file.name);
			params.set('expiration', opts.expiration);
			if (opts.password) params.set('password', opts.password);
			if (opts.maxDownloads) params.set('maxDownloads', opts.maxDownloads);
			params.set('ownerToken', ownerToken());

			var xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/upload/finalize');
			xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
			xhr.onload = function () { handleResponse(xhr, node); };
			xhr.onerror = function () { showError(node, 'Network error'); };
			xhr.send(params.toString());
		}

		next();
	}

	function handleResponse(xhr, node) {
		var payload;
		try { payload = JSON.parse(xhr.responseText); } catch (e) { payload = null; }
		if (xhr.status >= 200 && xhr.status < 300 && payload && payload.success) {
			showResult(node, payload.data);
		} else {
			showError(node, payload && payload.error ? payload.error.message : 'Upload failed');
		}
	}

	function handleFiles(files) {
		var max = CONFIG.maxFilesPerUpload || 20;
		var count = Math.min(files.length, max);
		for (var i = 0; i < count; i++) {
			var file = files[i];
			var node = addItem(file);
			if (CONFIG.maxFileSize && file.size > CONFIG.maxFileSize) {
				showError(node, 'Exceeds max size');
				continue;
			}
			if (file.size > (CONFIG.chunkSize || 90 * 1024 * 1024)) uploadChunked(file, node);
			else uploadSingle(file, node);
		}
	}

	dropzone.addEventListener('click', function () { input.click(); });
	dropzone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
	input.addEventListener('change', function () { if (input.files.length) handleFiles(input.files); input.value = ''; });

	['dragenter', 'dragover'].forEach(function (evt) {
		dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
	});
	['dragleave', 'drop'].forEach(function (evt) {
		dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); });
	});
	dropzone.addEventListener('drop', function (e) {
		if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
	});

	document.addEventListener('paste', function (e) {
		if (!e.clipboardData || !e.clipboardData.files || !e.clipboardData.files.length) return;
		handleFiles(e.clipboardData.files);
	});
})();
