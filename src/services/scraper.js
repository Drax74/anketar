import { supabase } from '../supabase.js';

export async function scrapeAccommodation(url) {
    const { data, error } = await supabase.functions.invoke('scraper', {
        body: { url }
    });

    if (error) throw error;

    if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        data.error
    ) {
        throw new Error('The scraper returned an invalid response.');
    }

    const rawTitle = typeof data.title === 'string'
        ? data.title.trim()
        : '';

    const image = typeof data.image === 'string'
        ? data.image.trim()
        : '';

    const description = typeof data.description === 'string'
        ? data.description.trim()
        : '';

    if (!rawTitle && !image) {
        throw new Error('No accommodation metadata was returned.');
    }

    return {
        link: url,
        title: rawTitle.split(' - ')[0].trim() || 'Smještaj',
        image,
        description
    };
}