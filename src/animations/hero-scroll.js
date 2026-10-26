import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function initHeroScrollAnimations() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    const hero = document.querySelector('.hero-header');
    const heroBg = document.querySelector('.hero-bg-parallax');
    const heroContent = document.querySelector('.hero-content-inner');
    const stickyWrapper = document.querySelector('.sticky-header-wrapper');

    if (!hero || !stickyWrapper) return;

    const heroTl = gsap.timeline({
        scrollTrigger: {
            trigger: '.app-scroll-container',
            start: 'top top',
            end: '+=250',
            scrub: 0.6, // <-- CHANGED FROM true TO 0.6 (adds smooth lag smoothing)
            invalidateOnRefresh: true
        }
    });

    // 1. Parallax scroll effect for hero background image
    heroTl.to(heroBg, {
        y: '25%',
        ease: 'none'
    }, 0);

    // 2. Smooth title and date translation, scale down, and fade out
    if (heroContent) {
        heroTl.to(heroContent, {
            y: -45,
            scale: 0.88,
            opacity: 0,
            ease: 'power1.out'
        }, 0);
    }

    // 3. Smooth collapse of the hero container height
    heroTl.to(hero, {
        height: '75px',
        paddingTop: '12px',
        paddingBottom: '12px',
        ease: 'power1.inOut'
    }, 0);
}