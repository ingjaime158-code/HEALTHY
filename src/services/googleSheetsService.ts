/**
 * Service to push client data to Google Sheets via Webhook (Google Apps Script)
 */

const GAS_URLS = {
    Matutina: 'https://script.google.com/macros/s/AKfycbxPxN0wqRT7Y5z9D8VVOuXmPaN9LP0swpVKB9YqLTXWYj3Mc7Qj2MHNVc9KiGnIJIyQ/exec',
    Vespertina: 'https://script.google.com/macros/s/AKfycbwlB2MfXAj54g4_78CUzsgtqnaTuFKYuPWYx_fVWHSQeNF5HWElprSg-6wshKcfM6M/exec'
};

export const pushToGoogleSheets = async (routeType: 'Matutina' | 'Vespertina', data: {
    name: string,
    phone: string,
    address: string,
    locationLink: string,
    coords: string
}) => {
    const url = GAS_URLS[routeType];
    if (!url) {
        console.error('No GAS URL found for route type:', routeType);
        return false;
    }

    try {
        // We use a simple POST with text/plain to avoid CORS preflight (OPTIONS) requests
        // that Google Apps Script doesn't handle well.
        await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: JSON.stringify(data)
        });

        return true;
    } catch (error) {
        console.error('Error pushing to Google Sheets:', error);
        return false;
    }
};
