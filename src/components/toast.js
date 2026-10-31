let toastTimer = null;

export function showToast(message, kind = 'info') {
    const toast = document.getElementById('app-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.add('visible');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 2600);
}