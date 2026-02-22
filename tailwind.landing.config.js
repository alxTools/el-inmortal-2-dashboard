module.exports = {
    content: [
        './frontend/landing/**/*.{js,jsx}',
        './views/landing/**/*.ejs'
    ],
    theme: {
        extend: {
            colors: {
                ink: '#060b15',
                ember: '#f97316',
                gold: '#facc15',
                ocean: '#0ea5e9'
            },
            boxShadow: {
                stage: '0 24px 80px rgba(15, 23, 42, 0.45)'
            }
        }
    },
    plugins: []
};
