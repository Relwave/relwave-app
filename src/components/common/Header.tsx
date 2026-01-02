import React from 'react'
import { Plus, RefreshCw, Database, Settings } from 'lucide-react'
import { ModeToggle } from './ModeToggle'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Link } from 'react-router-dom'

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
    <header className="border-b border-border/20 bg-background/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-muted-foreground/60" />
            <div>
              <h1 className="text-base font-medium text-foreground">
                DB Studio
              </h1>
              <p className="text-[11px] text-muted-foreground/70">
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

            <Link to={'/settings'}>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 h-9 text-xs">
                  <Plus className="h-4 w-4" />
                  <span>Add Connection</span>
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <Database className="h-4 w-4 text-muted-foreground/60" />
                    New Database Connection
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Connect to a local, Docker, or remote database
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Connection Name</Label>
                    <Input
                      placeholder="My Production DB"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Database Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(val) => handleInputChange('type', val)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select database type" />
                      </SelectTrigger>
                      <SelectContent>
                        {['postgresql', 'mysql'].map((db) => (
                          <SelectItem key={db} value={db} className="text-sm">
                            {db.charAt(0).toUpperCase() + db.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Host</Label>
                      <Input
                        placeholder="localhost"
                        value={formData.host}
                        onChange={(e) => handleInputChange('host', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Port</Label>
                      <Input
                        placeholder="5432"
                        value={formData.port}
                        onChange={(e) => handleInputChange('port', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Username</Label>
                      <Input
                        placeholder="postgres"
                        value={formData.user}
                        onChange={(e) => handleInputChange('user', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Password</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Database Name</Label>
                    <Input
                      placeholder="myapp_db"
                      value={formData.database}
                      onChange={(e) => handleInputChange('database', e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/20">
                    <Checkbox
                      id="ssl"
                      checked={formData.ssl}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, ssl: checked as boolean }))
                      }
                    />
                    <Label htmlFor="ssl" className="cursor-pointer text-xs">
                      Enable SSL Connection
                    </Label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)} size="sm" className="text-xs">
                    Cancel
                  </Button>
                  <Button onClick={handleAddDatabase} size="sm" className="text-xs">
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
