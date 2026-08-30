import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'lite-redirect',
      transformIndexHtml(html) {
        const script = "<script>var ua=navigator.userAgent.toLowerCase();var isSamsungTV=(ua.indexOf('samsung')>=0&&(ua.indexOf('tizen')>=0||ua.indexOf('smarttv')>=0||ua.indexOf('smart-tv')>=0||ua.indexOf('hinternet')>=0||/h\\s?\\d{4}/.test(ua))&&ua.indexOf('mobile')<0);if(isSamsungTV){location.replace('/lite.html');}else if(!('noModule' in document.createElement('script'))){location.replace('/lite.html');}else{setTimeout(function(){if(!document.getElementById('root'))location.replace('/lite.html');},3000);}</script>"
        return html.replace('<head>', '<head>' + script)
      }
    }
  ],
  emptyOutDir: false,
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: { host: '0.0.0.0', port: 5173 }
})
