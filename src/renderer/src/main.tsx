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
import Commenter from './routes/Commenter'
import CommenterPR from './routes/CommenterPR'
import Corrector from './routes/Corrector'
import TestGenerator from './routes/TestGenerator'
import GitExplorer from './routes/GitExplorer'
import SprintBoard from './routes/SprintBoard'
import TicketBranch from './routes/TicketBranch'
import PrAcReview from './routes/PrAcReview'
import KnowledgeBase from './routes/KnowledgeBase'
import ReleaseNotes from './routes/ReleaseNotes'
import SprintPlanning from './routes/SprintPlanning'
import BugRepro from './routes/BugRepro'
import Traceability from './routes/Traceability'

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
      { path: 'admin', element: <Admin /> },
      { path: 'commenter', element: <Commenter /> },
      { path: 'commenter-pr', element: <CommenterPR /> },
      { path: 'corrector', element: <Corrector /> },
      { path: 'test-generator', element: <TestGenerator /> },
      { path: 'git', element: <GitExplorer /> },
      { path: 'sprint', element: <SprintBoard /> },
      { path: 'ticket-branch', element: <TicketBranch /> },
      { path: 'pr-ac', element: <PrAcReview /> },
      { path: 'knowledge', element: <KnowledgeBase /> },
      { path: 'release-notes', element: <ReleaseNotes /> },
      { path: 'sprint-planning', element: <SprintPlanning /> },
      { path: 'bug-repro', element: <BugRepro /> },
      { path: 'traceability', element: <Traceability /> }
    ]
  }
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
