import React from 'react'
import ReactDOM from 'react-dom/client'
import { Sparkles, Upload, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import './assets/index.css'

function App(): React.JSX.Element {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles />
              BatchClip
            </CardTitle>
            <Badge>v0.1</Badge>
          </div>
          <CardDescription>
            shadcn primitives wired to the brand theme — warm brown surfaces,
            violet accent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button>
            <Sparkles />
            Score clips
          </Button>
          <Button variant="secondary">
            <Upload />
            Import video
          </Button>
          <Button variant="outline">
            <Play />
            Preview
          </Button>
          <Badge variant="secondary">9:16</Badge>
          <Badge variant="outline">PRESTYJ</Badge>
        </CardContent>
      </Card>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
