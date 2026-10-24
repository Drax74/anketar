import { animate, spring } from "motion";

/**
 * Universal FLIP Spring Animation Engine with Smooth Cinematic Easing
 */
export async function animateLayoutTransition(container, renderCallback, options = {}) {
    if (!container || typeof animate !== 'function') {
        renderCallback();
        return;
    }

    const selector = options.selector || '.animate-item';
    const oldRects = new Map();
    container.querySelectorAll(selector).forEach(el => {
        oldRects.set(el.dataset.id, el.getBoundingClientRect());
    });

    renderCallback();

    // Tuned for a buttery-smooth, non-snappy feel (lower stiffness, optimal damping)
    const stiffness = options.stiffness || 200;
    const damping = options.damping || 28;

    container.querySelectorAll(selector).forEach(newEl => {
        const id = newEl.dataset.id;
        const oldRect = oldRects.get(id);
        const newRect = newEl.getBoundingClientRect();

        if (oldRect) {
            const dx = oldRect.left - newRect.left;
            const dy = oldRect.top - newRect.top;

            if (dx !== 0 || dy !== 0) {
                animate(
                    newEl,
                    { transform: [`translate(${dx}px, ${dy}px)`, 'none'] },
                    { type: spring, stiffness, damping }
                );
            }
        } else if (options.fadeIn) {
            animate(
                newEl,
                { opacity: [0, 1], scale: [0.97, 1], y: [12, 0] },
                { duration: 0.45, easing: [0.22, 1, 0.36, 1] } // Smooth cubic-bezier entrance
            );
        }
    });
}