import { t } from '../i18n.js';
import { materialIcon } from '../shared/helpers/icons.js';
import { state } from '../state.js';
import { animateLayoutTransition } from '../animations/motion.js';
import { openDetail } from './modals.js';
import { renderVoters } from './voters.js';
import { formatVotes } from '../shared/helpers/format.js';
import { setAccommodationImage } from '../shared/helpers/images.js';
import { renderAvailabilityBadge } from './availability-badge.js';

function rankingRow({ option, rank }, featured = false, compact = false) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `ranking-row animate-item${featured ? ' ranking-row--featured' : ''}${compact ? ' ranking-row--compact' : ''}`;
    row.dataset.id = option.id;
    row.dataset.detailId = option.id;
    row.setAttribute('aria-label', t('rankings.rowLabel', { title: option.title || t('common.stay'), votes: formatVotes(option.voters.length) }));
    if (option.is_taken === true) row.setAttribute('aria-label', t('availability.itemLabel', { title: row.getAttribute('aria-label') }));
    row.innerHTML = `
        <span class="ranking-row__rank"></span>
        <span class="card-cover-container ranking-row__image-wrap"><img class="card-cover ranking-row__image" alt="" loading="lazy" /></span>
        <span class="ranking-row__copy"><span class="ranking-row__heading"><span class="leaderboard-item-title ranking-row__title"></span><span class="ranking-row__availability" hidden></span></span><span class="ranking-row__votes"></span></span>
        <span class="ranking-row__voters"></span>
        <span class="material-symbols-outlined ranking-row__arrow" aria-hidden="true">&#xe5cc;</span>`;
    row.querySelector('.ranking-row__rank').textContent = String(rank).padStart(2, '0');
    row.querySelector('.ranking-row__title').textContent = option.title || t('common.stay');
    row.querySelector('.ranking-row__votes').textContent = formatVotes(option.voters.length);
    renderAvailabilityBadge(row.querySelector('.ranking-row__availability'), option);
    const image = row.querySelector('img');
    setAccommodationImage(image, option.image);
    if (featured) renderVoters(row.querySelector('.ranking-row__voters'), option.voters, option.voterEmails);
    row.addEventListener('click', () => openDetail(option.id));
    return row;
}

function renderTeaser(ranked) {
    const teaser = document.getElementById('leader-teaser');
    if (!teaser) return;
    teaser.hidden = !state.options.length;
    teaser.disabled = false;
    teaser.setAttribute('aria-busy', 'false');
    teaser.replaceChildren();
    if (teaser.hidden) return;
    const maximum = ranked[0]?.option.voters.length || 0;
    const leaders = ranked.filter(entry => entry.option.voters.length === maximum);
    const joint = leaders.length > 1;
    const option = ranked[0]?.option;
    teaser.innerHTML = `<span class="leader-teaser__visual"></span><span class="leader-teaser__copy"><span class="leader-teaser__eyebrow"></span><span class="leader-teaser__heading"><span class="leader-teaser__title"></span><span class="leader-teaser__availability" hidden></span></span><span class="leader-teaser__votes"></span></span><span class="material-symbols-outlined leader-teaser__arrow" aria-hidden="true">&#xe5cc;</span>`;
    const visual = teaser.querySelector('.leader-teaser__visual');
    if (option && !joint) {
        const image = document.createElement('img');
        image.className = 'leader-teaser__image';
        image.alt = '';
        setAccommodationImage(image, option.image);
        visual.append(image);
    } else {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = materialIcon(joint ? 'equal' : 'favorite');
        icon.setAttribute('aria-hidden', 'true');
        visual.append(icon);
    }
    teaser.querySelector('.leader-teaser__eyebrow').textContent = joint ? t('rankings.tied') : option ? t('rankings.leading') : t('rankings.teamChooses');
    teaser.querySelector('.leader-teaser__title').textContent = joint ? t('rankings.jointLeaders', { count: leaders.length }) : option?.title || t('rankings.everyVote');
    teaser.querySelector('.leader-teaser__votes').textContent = option ? formatVotes(maximum) : t('votes.first');
    renderAvailabilityBadge(teaser.querySelector('.leader-teaser__availability'), joint ? null : option);
}

export async function renderLeaderboard(animateTransition = true) {
    const options = [...state.options].filter(option => option.voters?.length)
        .sort((a, b) => b.voters.length - a.voters.length || String(a.title).localeCompare(String(b.title), t('locale')));
    let previous = null;
    let rank = 0;
    const ranked = options.map((option, index) => {
        if (option.voters.length !== previous) rank = index + 1;
        previous = option.voters.length;
        return { option, rank };
    });
    renderTeaser(ranked);
    const uniqueLeader = ranked.length && (ranked.length === 1 || ranked[0].option.voters.length > ranked[1].option.voters.length);

    for (const [id, compact] of [['leaderboard-container', false], ['leaderboard-preview', true]]) {
        const container = document.getElementById(id);
        if (!container) continue;
        const render = () => {
            container.replaceChildren();
            if (!ranked.length) {
                const empty = document.createElement('p');
                empty.className = 'ranking-empty';
                empty.textContent = t('rankings.empty');
                container.append(empty);
                return;
            }
            const entries = compact ? ranked.slice(0, 3) : ranked;
            entries.forEach((entry, index) => container.append(rankingRow(entry, !compact && index === 0 && uniqueLeader, compact)));
        };
        if (animateTransition && container.children.length && container.getClientRects().length) {
            await animateLayoutTransition(container, render, { selector: '.ranking-row', stiffness: 240, damping: 30, fadeIn: true });
        } else render();
    }
}
