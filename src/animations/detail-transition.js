import { animate } from 'motion';

let activeTransition = null;

export function cancelDetailTransition() {
    activeTransition?.finish(false);
}

function imageBounds(image) {
    const element = image?.closest('.card-cover-container') || image;
    return element?.getBoundingClientRect();
}

function isVisible(rect) {
    return rect && rect.width > 0 && rect.height > 0 &&
        rect.bottom > 0 && rect.top < window.innerHeight &&
        rect.right > 0 && rect.left < window.innerWidth;
}

function cardRadii(image) {
    const card = image?.closest('.option-card');
    if (!card) return [0, 0, 0, 0];

    const style = getComputedStyle(card);
    const border = parseFloat(style.borderTopWidth) || 0;

    return [
        Math.max(
            0,
            (parseFloat(style.borderTopLeftRadius) || 0) - border
        ),
        Math.max(
            0,
            (parseFloat(style.borderTopRightRadius) || 0) - border
        ),
        0,
        0
    ];
}

function createMovingControls(
    sourceImage,
    targetImage,
    opening,
    layer,
    restores
) {
    const sourceCover = sourceImage?.closest('.card-cover-container');
    const targetCover = targetImage?.closest('.card-cover-container');
    const controls = [];

    for (const selector of ['.card-heart-btn', '.price-badge']) {
        const source = sourceCover?.querySelector(selector);
        const target = targetCover?.querySelector(selector);

        if (!source || !target) continue;

        const start = opening ? source : target;
        const end = opening ? target : source;

        const wrapper = document.createElement('div');
        wrapper.className = 'detail-transition__control';

        const clone = start.cloneNode(true);
        clone.removeAttribute('id');
        clone.removeAttribute('onclick');
        clone.classList.remove('is-popping');
        clone.querySelector('.vote-heart-particles')?.remove();

        clone.querySelectorAll('[id]').forEach(element => {
            element.removeAttribute('id');
        });

        Object.assign(clone.style, {
            position: 'static',
            width: '100%',
            height: '100%',
            margin: '0',
            transform: 'none',
            transition: 'none',
            animation: 'none'
        });

        wrapper.inert = true;
        wrapper.append(clone);
        layer.append(wrapper);

        controls.push({
            element: wrapper,
            from: start.getBoundingClientRect(),
            to: end.getBoundingClientRect()
        });

        for (const original of [source, target]) {
            const visibility = original.style.visibility;

            restores.push(() => {
                original.style.visibility = visibility;
            });

            original.style.visibility = 'hidden';
        }
    }

    return controls;
}

export function animateDetailOpen(options) {
    return runTransition({ ...options, opening: true });
}

export function animateDetailClose(options) {
    return runTransition({ ...options, opening: false });
}

function runTransition({ sourceImage, targetImage, sheet, opening }) {
    cancelDetailTransition();

    if (
        !sheet ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        return Promise.resolve(true);
    }

    const from = imageBounds(opening ? sourceImage : targetImage);
    const to = imageBounds(opening ? targetImage : sourceImage);
    const image = opening ? sourceImage : targetImage;

    const sharedImage = isVisible(from) && isVisible(to) &&
        image?.complete && image.naturalWidth > 0;

    const duration = opening ? 0.44 : 0.32;

    return new Promise(resolve => {
        const animations = [];
        const restores = [];

        let layer = null;
        let progress = null;
        let finished = false;

        const transition = {
            finish(completed) {
                if (finished) return;
                finished = true;

                progress?.stop();
                animations.forEach(animation => animation.cancel());
                restores.forEach(restore => restore());
                layer?.remove();

                if (activeTransition === transition) {
                    activeTransition = null;
                }

                resolve(completed);
            }
        };

        activeTransition = transition;

        try {
            let paint = () => {};

            if (sharedImage) {
                layer = document.createElement('div');
                layer.className = 'detail-transition';
                layer.setAttribute('aria-hidden', 'true');
                layer.style.width = `${to.width}px`;
                layer.style.height = `${to.height}px`;

                const clone = document.createElement('img');
                clone.className = 'detail-transition__image';
                clone.alt = '';
                clone.src = image.currentSrc || image.src;
                clone.style.width = `${image.naturalWidth}px`;
                clone.style.height = `${image.naturalHeight}px`;

                layer.append(clone);
                document.body.append(layer);

                for (const original of new Set([sourceImage, targetImage])) {
                    if (!original) continue;

                    const visibility = original.style.visibility;

                    restores.push(() => {
                        original.style.visibility = visibility;
                    });

                    original.style.visibility = 'hidden';
                }

                const controls = createMovingControls(
                    sourceImage,
                    targetImage,
                    opening,
                    layer,
                    restores
                );

                const radii = cardRadii(sourceImage);
                const fromRadii = opening ? radii : [0, 0, 0, 0];
                const toRadii = opening ? [0, 0, 0, 0] : radii;
                const mix = (a, b, value) => a + (b - a) * value;

                // Counter-scaling preserves the photograph's proportions
                // while its clipping rectangle changes size.
                paint = value => {
                    const width = mix(from.width, to.width, value);
                    const height = mix(from.height, to.height, value);
                    const scaleX = width / to.width;
                    const scaleY = height / to.height;
                    const x = mix(from.left, to.left, value);
                    const y = mix(from.top, to.top, value);

                    const cover = Math.max(
                        width / image.naturalWidth,
                        height / image.naturalHeight
                    );

                    const offsetX =
                        (width - image.naturalWidth * cover) / 2;
                    const offsetY =
                        (height - image.naturalHeight * cover) / 2;

                    const corners = fromRadii.map((radius, index) =>
                        mix(radius, toRadii[index], value)
                    );

                    layer.style.transform =
                        `translate3d(${x}px, ${y}px, 0) ` +
                        `scale(${scaleX}, ${scaleY})`;

                    layer.style.borderRadius =
                        corners.map(radius => `${radius / scaleX}px`).join(' ') +
                        ' / ' +
                        corners.map(radius => `${radius / scaleY}px`).join(' ');

                    clone.style.transform =
                        `translate3d(${offsetX / scaleX}px, ${offsetY / scaleY}px, 0) ` +
                        `scale(${cover / scaleX}, ${cover / scaleY})`;

                    for (const control of controls) {
                        const left = mix(
                            control.from.left - from.left,
                            control.to.left - to.left,
                            value
                        );

                        const top = mix(
                            control.from.top - from.top,
                            control.to.top - to.top,
                            value
                        );

                        control.element.style.width =
                            `${mix(control.from.width, control.to.width, value)}px`;

                        control.element.style.height =
                            `${mix(control.from.height, control.to.height, value)}px`;

                        control.element.style.transform =
                            `translate3d(${left / scaleX}px, ${top / scaleY}px, 0) ` +
                            `scale(${1 / scaleX}, ${1 / scaleY})`;
                    }
                };

                paint(0);
            }

            animations.push(sheet.animate(
                [
                    { opacity: opening ? 0 : 1 },
                    { opacity: opening ? 1 : 0 }
                ],
                {
                    duration: opening ? 160 : 180,
                    delay: opening ? 0 : 60,
                    easing: 'ease-out',
                    fill: 'both'
                }
            ));

            const sections = Array.from(
                sheet.querySelector('.detail-content')?.children || []
            ).filter(section =>
                getComputedStyle(section).display !== 'none'
            );

            sections.forEach((section, index) => {
                animations.push(section.animate(
                    opening
                        ? [
                            { opacity: 0, transform: 'translateY(16px)' },
                            { opacity: 1, transform: 'translateY(0)' }
                        ]
                        : [
                            { opacity: 1, transform: 'translateY(0)' },
                            { opacity: 0, transform: 'translateY(8px)' }
                        ],
                    {
                        duration: opening ? 220 : 140,
                        delay: opening
                            ? 100 + Math.min(index, 4) * 25
                            : 0,
                        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        fill: 'both'
                    }
                ));
            });

            progress = animate(0, 1, {
                duration,
                ease: [0.22, 1, 0.36, 1],
                onUpdate: paint,
                onComplete: () => transition.finish(true)
            });
        } catch (error) {
            console.warn('Detail transition unavailable:', error);
            transition.finish(true);
        }
    });
}