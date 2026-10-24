import { supabase } from './supabase.js';

export async function getWhitelistedUsers() {
    const { data, error } = await supabase.from('whitelist').select('*');
    if (error) throw error;
    return data;
}

export async function getPollData() {
    const [whitelistRes, optionsRes, votesRes] = await Promise.all([
        supabase.from('whitelist').select('*'),
        supabase.from('options').select('*'),
        supabase.from('votes').select('*')
    ]);

    if (whitelistRes.error) throw whitelistRes.error;
    if (optionsRes.error) throw optionsRes.error;
    if (votesRes.error) throw votesRes.error;

    return {
        whitelist: whitelistRes.data,
        options: optionsRes.data,
        votes: votesRes.data
    };
}

export async function addVote(userEmail, optionId) {
    const { error } = await supabase.from('votes').insert([{ user_email: userEmail, option_id: optionId }]);
    if (error) throw error;
}

export async function removeVote(userEmail, optionId) {
    const { error } = await supabase.from('votes').delete().match({ user_email: userEmail, option_id: optionId });
    if (error) throw error;
}

export async function addOption(option) {
    const { error } = await supabase.from('options').insert([option]);
    if (error) throw error;
}
export async function updateOption(id, fields) {
    const { data, error } = await supabase
        .from('options')
        .update(fields)
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating option:', error);
        throw error;
    }
    return data;
}

export async function sendMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: `${window.location.origin}/anketar/` }
    });
    if (error) throw error;
}