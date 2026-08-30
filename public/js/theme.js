(function () {
	var KEY = 'dopra-theme';
	function resolve(theme) {
		if (theme === 'system') {
			return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		return theme;
	}
	function apply(theme) {
		document.documentElement.setAttribute('data-theme', resolve(theme));
	}
	function current() {
		try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
	}
	try {
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
			if (current() === 'system') apply('system');
		});
	} catch (e) {}
	document.addEventListener('click', function (e) {
		var btn = e.target.closest('[data-theme-toggle]');
		if (!btn) return;
		var resolved = document.documentElement.getAttribute('data-theme');
		var next = resolved === 'dark' ? 'light' : 'dark';
		try { localStorage.setItem(KEY, next); } catch (err) {}
		apply(next);
	});
})();
