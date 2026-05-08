import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom'
import App from './App'
import Settings from './routes/Settings'
import Project from './routes/Project'
import Generation from './routes/Generation'
import Chatbot from './routes/Chatbot'
import Coder from './routes/Coder'
import Admin from './routes/Admin'

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/settings" replace /> },
      { path: 'settings', element: <Settings /> },
      { path: 'project', element: <Project /> },
      { path: 'generation', element: <Generation /> },
      { path: 'chatbot', element: <Chatbot /> },
      { path: 'coder', element: <Coder /> },
      { path: 'admin', element: <Admin /> }
    ]
  }
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
