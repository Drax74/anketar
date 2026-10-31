import { supabase } from '../supabase.js';

export async function getWhitelistedUsers() {
    const { data, error } = await supabase.from('whitelist').select('*');
    if (error) throw error;
    return data;
}
export async function getPollData() {
    const { data: authData, error: authError } =
        await supabase.auth.getSession();

    if (authError) throw authError;

    const userEmail = authData.session?.user?.email;

    if (!userEmail) {
        const error = new Error('Sign in before loading poll data.');
        error.code = 'AUTH_REQUIRED';
        throw error;
    }

    const whitelist = await getWhitelistedUsers();

    const isApproved = whitelist.some(
        user => user.email === userEmail
    );

    if (!isApproved) {
        const error = new Error('Your account is not approved for this poll.');
        error.code = 'ACCESS_NOT_APPROVED';
        throw error;
    }

    const [optionsRes, votesRes] = await Promise.all([
        supabase.from('options').select('*'),
        supabase.from('votes').select('*')
    ]);

    if (optionsRes.error) throw optionsRes.error;
    if (votesRes.error) throw votesRes.error;

    return {
        userEmail,
        whitelist,
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

export async function getVotes() {
    const { data, error } = await supabase
        .from('votes')
        .select('*');

    if (error) throw error;

    return data;
}