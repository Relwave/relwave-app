import React from 'react'
import { Plus, RefreshCw, Database } from 'lucide-react'
import { ModeToggle } from './mode-toggle'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Checkbox } from './ui/checkbox'

interface HeaderProps {
  refreshing: boolean
  handleRefresh: () => void
  isDialogOpen: boolean
  setIsDialogOpen: (open: boolean) => void
  formData: {
    name: string
    type: string
    host: string
    port: string
    user: string
    password: string
    database: string
    sslmode: string
    ssl: boolean
  }
  handleInputChange: (field: string, value: string) => void
  setFormData: React.Dispatch<
    React.SetStateAction<{
      name: string
      type: string
      host: string
      port: string
      user: string
      password: string
      database: string
      sslmode: string
      ssl: boolean
    }>
  >
  handleAddDatabase: () => void
}

const Header = ({
  refreshing,
  handleRefresh,
  isDialogOpen,
  setIsDialogOpen,
  formData,
  handleInputChange,
  setFormData,
  handleAddDatabase,
}: HeaderProps) => {
  return (
    <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                DB Studio
              </h1>
              <p className="text-xs text-muted-foreground">
                Database Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />

            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-9 w-9"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  <span>Add Connection</span>
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    New Database Connection
                  </DialogTitle>
                  <DialogDescription>
                    Connect to a local, Docker, or remote database
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Connection Name</Label>
                    <Input
                      placeholder="My Production DB"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Database Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(val) => handleInputChange('type', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select database type" />
                      </SelectTrigger>
                      <SelectContent>
                        {['postgresql', 'mysql', 'mongodb', 'sqlite'].map((db) => (
                          <SelectItem key={db} value={db}>
                            {db.charAt(0).toUpperCase() + db.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Host</Label>
                      <Input
                        placeholder="localhost"
                        value={formData.host}
                        onChange={(e) => handleInputChange('host', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        placeholder="5432"
                        value={formData.port}
                        onChange={(e) => handleInputChange('port', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        placeholder="postgres"
                        value={formData.user}
                        onChange={(e) => handleInputChange('user', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Database Name</Label>
                    <Input
                      placeholder="myapp_db"
                      value={formData.database}
                      onChange={(e) => handleInputChange('database', e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Checkbox
                      id="ssl"
                      checked={formData.ssl}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, ssl: checked as boolean }))
                      }
                    />
                    <Label htmlFor="ssl" className="cursor-pointer text-sm">
                      Enable SSL Connection
                    </Label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddDatabase}>
                    Connect
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
