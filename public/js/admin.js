(function () {
	// Confirm destructive actions before submitting.
	document.addEventListener('submit', function (e) {
		var form = e.target.closest('[data-confirm]');
		if (form && !window.confirm(form.getAttribute('data-confirm'))) {
			e.preventDefault();
		}
	});

	function flash(btn, text) {
		var original = btn.textContent;
		btn.textContent = text;
		setTimeout(function () { btn.textContent = original; }, 1500);
	}

	document.addEventListener('click', async function (e) {
		var copyCode = e.target.closest('[data-copy-code]');
		if (copyCode) {
			var url = window.location.origin + '/' + copyCode.getAttribute('data-copy-code');
			try { await navigator.clipboard.writeText(url); flash(copyCode, 'Copied'); } catch (err) {}
			return;
		}

		var copy = e.target.closest('[data-copy]');
		if (copy) {
			try { await navigator.clipboard.writeText(copy.getAttribute('data-copy')); flash(copy, 'Copied'); } catch (err) {}
			return;
		}

		// Close open row menus when clicking elsewhere.
		document.querySelectorAll('details.row-menu[open]').forEach(function (menu) {
			if (!menu.contains(e.target)) menu.removeAttribute('open');
		});
	});
})();
