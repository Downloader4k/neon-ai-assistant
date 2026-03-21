/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        './src/renderer/**/*.{js,jsx,ts,tsx,html}',
    ],
    theme: {
        extend: {
            colors: {
                primary: '#f9ab00',
                'bg-primary': '#0a0a0a',
                'bg-secondary': '#1a1a1a',
                'bg-tertiary': '#2a2a2a',
                'text-primary': '#e0e0e0',
                'text-secondary': '#a0a0a0',
                border: '#333333',
                'accent-primary': '#f9ab00',
                'accent-secondary': '#ffbf00',
                'accent-light': 'rgba(249, 171, 0, 0.1)',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
            },
            keyframes: {
                fadeIn: {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
                slideUp: {
                    from: { transform: 'translateY(10px)', opacity: '0' },
                    to: { transform: 'translateY(0)', opacity: '1' },
                },
                pulseSubtle: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.5' },
                },
            },
        },
    },
    plugins: [
        require('tailwindcss-animate'),
        require('@tailwindcss/typography'),
    ],
};
