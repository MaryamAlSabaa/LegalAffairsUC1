import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration file.
// This tells Vite that our project is a React application.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
});

/*
BEGINNER DOCUMENTATION:

1. What is Vite?
Vite is a tool that runs and builds modern frontend applications quickly.

2. What is a plugin?
A plugin adds extra features to a tool. Here, the React plugin helps Vite understand React and JSX.

3. What is export default?
export default shares one main value from this file so another tool can use it.
*/
