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

	// Row menus live inside `.table-wrap`, which scrolls and therefore clips any
	// absolutely positioned child. Pin the panel to the viewport instead so it
	// can never be cut off, and flip it when it would overflow an edge.
	var MARGIN = 8;

	function placePanel(menu) {
		var summary = menu.querySelector('summary');
		var panel = menu.querySelector('.row-menu-panel');
		if (!summary || !panel) return;

		panel.style.maxHeight = '';
		panel.style.top = '0px';
		panel.style.left = '0px';

		var anchor = summary.getBoundingClientRect();
		var size = panel.getBoundingClientRect();
		var viewportW = document.documentElement.clientWidth;
		var viewportH = document.documentElement.clientHeight;

		var left = Math.min(anchor.right - size.width, viewportW - size.width - MARGIN);
		left = Math.max(MARGIN, left);

		var below = viewportH - anchor.bottom - MARGIN;
		var above = anchor.top - MARGIN;
		var openUp = size.height > below && above > below;
		var top = openUp ? Math.max(MARGIN, anchor.top - size.height - 6) : anchor.bottom + 6;

		panel.style.left = left + 'px';
		panel.style.top = top + 'px';
		panel.style.maxHeight = Math.max(120, (openUp ? above : below) - 6) + 'px';
	}

	function closeAll(except) {
		document.querySelectorAll('details.row-menu[open]').forEach(function (menu) {
			if (menu !== except) menu.removeAttribute('open');
		});
	}

	document.addEventListener('toggle', function (e) {
		var menu = e.target;
		if (!menu.classList || !menu.classList.contains('row-menu')) return;
		if (menu.open) {
			closeAll(menu);
			placePanel(menu);
		}
	}, true);

	function repositionOpen() {
		var open = document.querySelector('details.row-menu[open]');
		if (open) placePanel(open);
	}

	window.addEventListener('resize', repositionOpen);
	window.addEventListener('scroll', repositionOpen, true);

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape') closeAll(null);
	});

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
