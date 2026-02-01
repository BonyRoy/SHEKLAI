import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose REACT_APP_* env vars to the client (so REACT_APP_ENCRYPTION_KEY works)
  envPrefix: ['VITE_', 'REACT_APP_'],
})
