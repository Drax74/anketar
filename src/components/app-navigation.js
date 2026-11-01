import { openAddModal } from './add-modal.js';
import { closeDetail } from './detail-modal.js';

let currentView = null;
const positions = { stays: 0, rankings: 0 };

export function showAppView(view, { fromHistory = false, focus = true } = {}) {
    if (!['stays', 'rankings'].includes(view)) view = 'stays';
    if (currentView === view) return;

    if (currentView) positions[currentView] = window.scrollY;
    closeDetail({ immediate: true, fromHistory: true });
    currentView = view;

    for (const name of ['stays', 'rankings']) {
        document.getElementById(`${name}-view`).hidden = name !== view;
    }
    document.querySelectorAll('[data-nav-view]').forEach(button => {
        const selected = button.dataset.navView === view;
        if (button.closest('nav')) {
            if (selected) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
    });

    if (!fromHistory) {
        const entry = { ...(history.state || {}), anketarView: view };
        delete entry.anketarDetail;
        history.pushState(entry, '');
    }

    window.scrollTo({ top: positions[view], behavior: 'instant' });
    if (focus) {
        const heading = document.getElementById(view === 'rankings' ? 'rankings-heading' : 'stays-heading');
        heading?.focus({ preventScroll: true });
    }
}

export function setupAppNavigation() {
    document.querySelectorAll('[data-nav-view]').forEach(button => {
        button.addEventListener('click', () => showAppView(button.dataset.navView));
    });
    document.querySelectorAll('[data-add-accommodation]').forEach(button => {
        button.addEventListener('click', openAddModal);
    });
    window.addEventListener('popstate', () => {
        const entry = history.state;
        showAppView(entry?.anketarView || 'stays', { fromHistory: true });
        if (entry?.anketarDetail) {
            history.replaceState(entry, '');
            window.dispatchEvent(new Event('poll:ready'));
        }
    });
    showAppView(history.state?.anketarView || 'stays', { fromHistory: true, focus: false });
}
