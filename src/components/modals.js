import {
    openAddModal,
    closeAddModal,
    resetAddModalStep,
    submitLinkAndFetch,
    submitNewOption
} from './add-modal.js';

import {
    openDetail,
    closeDetail,
    updateDetailModalIfOpen,
    saveOptionDetails
} from './detail-modal.js';

export { showToast } from './toast.js';

export {
    openAddModal,
    closeAddModal,
    resetAddModalStep,
    submitLinkAndFetch,
    submitNewOption,
    openDetail,
    closeDetail,
    updateDetailModalIfOpen,
    saveOptionDetails
};

// Retain handlers used by the existing HTML.
window.submitLinkAndFetch = submitLinkAndFetch;
window.submitNewOption = submitNewOption;
window.resetAddModalStep = resetAddModalStep;
window.saveOptionDetails = saveOptionDetails;