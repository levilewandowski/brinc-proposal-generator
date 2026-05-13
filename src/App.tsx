import { Routes, Route } from 'react-router'
import { Toaster } from 'sonner'
import Home from './pages/Home'
import ProposalView from './pages/ProposalView'
import SlideLibrary from './pages/SlideLibrary'

export default function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/proposal/:id" element={<ProposalView />} />
        <Route path="/library" element={<SlideLibrary />} />
      </Routes>
    </>
  )
}
