import {defineConfig} from 'vite';
export default defineConfig({build:{rollupOptions:{output:{manualChunks:{charts:['echarts'],react:['react','react-dom'],i18n:['i18next','react-i18next']}}}}});
