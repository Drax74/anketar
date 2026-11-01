import { showAppView } from './app-navigation.js';
import { closeDetail } from './detail-modal.js';
import { closeAddModal } from './add-modal.js';

// Touch events let us claim only an intentional gesture, leaving native scrolling,
// pinch zoom and browser edge navigation untouched. No pointer capture or global
// touch-action override is needed.
export function setupTouchControls({ refresh, canRefresh }) {
    const mobile = matchMedia('(max-width: 1023px)');
    const stays = document.getElementById('stays-view');
    const indicator = document.createElement('div');
    indicator.className = 'pull-refresh';
    indicator.hidden = true;
    indicator.setAttribute('role', 'status');
    indicator.innerHTML = '<span class="pull-refresh__spinner" aria-hidden="true"></span><span class="pull-refresh__label"></span>';
    document.body.append(indicator);
    const label = indicator.querySelector('.pull-refresh__label');
    const interactive = 'a, button, input, textarea, select, label, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"]';
    let gesture = null;
    let refreshing = false;
    let suppressClickUntil = 0;

    function reset() {
        gesture = null;
        if (!refreshing) indicator.hidden = true;
    }

    function hasScrollableParent(target, boundary) {
        for (let el = target; el && el !== boundary; el = el.parentElement) {
            if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
            if (el.scrollTop > 0) return true;
        }
        return false;
    }

    document.addEventListener('touchstart', event => {
        suppressClickUntil = 0;
        reset();
        if (!mobile.matches || event.touches.length !== 1 || refreshing) return;
        const target = event.target;
        const touch = event.touches[0];
        const control = target.closest(interactive);
        // Both edges belong to the browser (Back/Forward), even inside a sheet.
        if (touch.clientX < 28 || touch.clientX > innerWidth - 28 ||
            (control && !control.matches('.ranking-row, .stay-card__title-button')) ||
            document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') ||
            !window.getSelection()?.isCollapsed) return;

        const overlay = target.closest('#detail-overlay.active, #add-modal-overlay.active');
        const sheet = overlay?.querySelector('.detail-sheet, .native-sheet-container');
        if (document.querySelector('#auth-modal.active, .profile-menu__panel.active')) return;
        if (document.querySelector('#detail-overlay.active, #add-modal-overlay.active') && !sheet) return;
        if (sheet && (!sheet.contains(target) || sheet.scrollTop > 0 ||
            overlay.querySelector('#detail-editable-section:not([hidden])'))) return;
        const view = target.closest('#stays-view, #rankings-view');
        if (!sheet && !view) return;
        if (hasScrollableParent(target, sheet || document.body)) return;
        gesture = {
            x: touch.clientX, y: touch.clientY, id: touch.identifier,
            sheet, overlay, view, axis: null, distance: 0,
            pull: !sheet && view === stays && window.scrollY <= 0 && canRefresh()
        };
    }, { passive: true });

    document.addEventListener('touchmove', event => {
        if (!gesture) return;
        if (!mobile.matches || event.touches.length !== 1 || !event.cancelable) return reset();
        const touch = event.touches[0];
        if (touch.identifier !== gesture.id) return reset();
        const dx = touch.clientX - gesture.x;
        const dy = touch.clientY - gesture.y;
        if (!gesture.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
            if (Math.abs(dx) > Math.abs(dy) * 1.5 && !gesture.sheet) gesture.axis = 'x';
            else if (dy > Math.abs(dx) * 1.5 && (gesture.sheet || gesture.pull)) gesture.axis = 'y';
            else return reset(); // Scrolling or an ambiguous diagonal owns this touch.
        }
        if (gesture.axis === 'y' && (dy < 0 || (gesture.sheet ? gesture.sheet.scrollTop > 0 : window.scrollY > 0))) return reset();
        event.preventDefault();
        gesture.distance = gesture.axis === 'x' ? dx : dy;
        if (gesture.pull && gesture.axis === 'y') {
            indicator.hidden = false;
            label.textContent = dy >= 80 ? 'Otpusti za osvježavanje' : 'Povuci za osvježavanje';
        }
    }, { passive: false });

    document.addEventListener('touchend', async event => {
        const completed = gesture;
        reset();
        if (!completed?.axis || event.touches.length || !mobile.matches) return;
        // A claimed drag must not also activate the element under the finger.
        suppressClickUntil = performance.now() + 400;
        if (completed.axis === 'x' && Math.abs(completed.distance) >= 72) {
            if (completed.distance < 0 && completed.view === stays) showAppView('rankings', { focus: false });
            if (completed.distance > 0 && completed.view?.id === 'rankings-view') showAppView('stays', { focus: false });
        } else if (completed.axis === 'y' && completed.distance >= 80) {
            if (completed.sheet) {
                if (completed.overlay.id === 'detail-overlay') closeDetail();
                else closeAddModal();
            } else if (completed.pull && canRefresh()) {
                refreshing = true;
                indicator.hidden = false;
                indicator.classList.add('pull-refresh--loading');
                label.textContent = 'Osvježavanje…';
                try {
                    await refresh();
                } finally {
                    refreshing = false;
                    indicator.classList.remove('pull-refresh--loading');
                    indicator.hidden = true;
                }
            }
        }
    }, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    mobile.addEventListener('change', reset);
    document.addEventListener('click', event => {
        const touchClick = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents;
        if (touchClick && event.isTrusted && event.detail > 0 && mobile.matches && performance.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);
}
