(function () {
	function flash(btn, text) {
		var original = btn.textContent;
		btn.textContent = text;
		setTimeout(function () { btn.textContent = original; }, 1500);
	}

	// Paths are resolved against the real page origin, so links are always
	// correct no matter how the app is proxied or which domain is used.
	function absolute(path) {
		return window.location.origin + path;
	}

	document.addEventListener('click', async function (e) {
		var copyPath = e.target.closest('[data-copy-path]');
		if (copyPath) {
			try {
				await navigator.clipboard.writeText(absolute(copyPath.getAttribute('data-copy-path')));
				flash(copyPath, 'Copied!');
			} catch (err) {}
			return;
		}

		var copy = e.target.closest('[data-copy]');
		if (copy) {
			try {
				await navigator.clipboard.writeText(copy.getAttribute('data-copy'));
				flash(copy, 'Copied!');
			} catch (err) {}
			return;
		}

		var share = e.target.closest('[data-share-path], [data-share]');
		if (share) {
			var url = share.hasAttribute('data-share-path')
				? absolute(share.getAttribute('data-share-path'))
				: share.getAttribute('data-share');
			var title = share.getAttribute('data-share-title') || document.title;
			if (navigator.share) {
				try { await navigator.share({ title: title, url: url }); } catch (err) {}
			} else {
				try {
					await navigator.clipboard.writeText(url);
					flash(share, 'Link copied!');
				} catch (err) {}
			}
		}
	});
})();
