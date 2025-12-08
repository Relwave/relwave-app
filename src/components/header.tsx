import React from 'react'
import { Plus, RefreshCw, Server } from 'lucide-react'
import { ModeToggle } from './mode-toggle'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Checkbox } from './ui/checkbox'



interface HeaderProps {
  refreshing: boolean
  handleRefresh: () => void
  isDialogOpen: boolean
  setIsDialogOpen: (open: boolean) => void;
  formData: {
    name: string;
    type: string;
    host: string;
    port: string;
    user: string;
    password: string;
    database: string;
    sslmode: string;
    ssl: boolean;
  };
  handleInputChange: (field: string, value: string) => void;
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    type: string;
    host: string;
    port: string;
    user: string;
    password: string;
    database: string;
    sslmode: string;
    ssl: boolean;
  }>>;
  handleAddDatabase: () => void;
}


const Header = ({ refreshing, handleRefresh, isDialogOpen, setIsDialogOpen, formData, handleInputChange, setFormData, handleAddDatabase }: HeaderProps) => {
  return (
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50 shadow-sm dark:shadow-md shrink-0">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Solid Cyan Icon Background */}
            <div className="p-3 bg-cyan-500 rounded-xl shadow-lg">
              <Server className="h-6 w-6 text-white" />
            </div>
            <div>
              {/* Solid Cyan Text Title */}
              <h1 className="text-3xl font-extrabold text-cyan-500">
                Data Portal
              </h1>
              <p className="text-sm text-muted-foreground">Manage and visualize your connections</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="hover:border-primary hover:bg-accent transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                {/* Solid Cyan Button (formerly gradient) */}
                <Button className="bg-cyan-500 hover:bg-cyan-600 transition-all shadow-lg shadow-cyan-500/30">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Connection
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] bg-background border-border rounded-xl shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-foreground">
                    Add New Database Connection 🔌
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Connect to a local, Docker, or remote database instance.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="db-name" className="text-foreground">Connection Name</Label>
                    <Input
                      id="db-name"
                      placeholder="My Production DB"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="bg-input/50 border-border focus:border-primary text-foreground transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-type" className="text-foreground">Database Type</Label>
                    <Select value={formData.type} onValueChange={(val) => handleInputChange('type', val)}>
                      <SelectTrigger id="db-type" className="bg-input/50 border-border focus:border-primary text-foreground transition-colors">
                        <SelectValue placeholder="Select database type" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border text-foreground shadow-xl">
                        <SelectItem value="postgresql">PostgreSQL</SelectItem>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="mongodb">MongoDB</SelectItem>
                        <SelectItem value="sqlite">SQLite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="host" className="text-foreground">Host</Label>
                      <Input
                        id="host"
                        placeholder="localhost"
                        value={formData.host}
                        onChange={(e) => handleInputChange('host', e.target.value)}
                        className="bg-input/50 border-border focus:border-primary text-foreground transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="port" className="text-foreground">Port</Label>
                      <Input
                        id="port"
                        placeholder="5432"
                        value={formData.port}
                        onChange={(e) => handleInputChange('port', e.target.value)}
                        className="bg-input/50 border-border focus:border-primary text-foreground transition-colors"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-foreground">Username</Label>
                      <Input
                        id="username"
                        placeholder="postgres"
                        value={formData.user}
                        onChange={(e) => handleInputChange('user', e.target.value)}
                        className="bg-input/50 border-border focus:border-primary text-foreground transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-foreground">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        className="bg-input/50 border-border focus:border-primary text-foreground transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="database" className="text-foreground">Database Name</Label>
                    <Input
                      id="database"
                      placeholder="myapp_db"
                      value={formData.database}
                      onChange={(e) => handleInputChange('database', e.target.value)}
                      className="bg-input/50 border-border focus:border-primary text-foreground transition-colors"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="ssl"
                      checked={formData.ssl}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ssl: checked as boolean }))}
                    />
                    <Label htmlFor="ssl" className="text-foreground cursor-pointer">
                      Enable SSL Connection
                    </Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="border-border hover:bg-accent transition-colors"
                  >
                    Cancel
                  </Button>
                  {/* Solid Cyan Button (formerly gradient) */}
                  <Button
                    onClick={handleAddDatabase}
                    className="bg-cyan-500 hover:bg-cyan-600 transition-all shadow-md shadow-cyan-500/30"
                  >
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