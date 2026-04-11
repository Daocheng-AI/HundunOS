import React, { useState, useEffect } from 'react'
import {
  Search,
  Plus,
  Settings,
  Download,
  Upload,
  Play,
  GitBranch,
  Cloud,
  Terminal,
  ChevronRight,
  X,
  Check,
  AlertCircle,
} from 'lucide-react'

// Mock data
const mockSkills = [
  {
    name: 'github-helper',
    version: '2.1.0',
    description: 'GitHub operations via gh CLI: issues, PRs, CI runs, code review, API queries.',
    tags: ['github', 'git', 'ci', 'code-review'],
    icon: '🐙',
    triggers: ['github', 'pr', 'issue'],
    tools: ['gh', 'curl'],
    platforms: ['claude', 'cursor', 'openclaw'],
  },
  {
    name: 'weather-advisor',
    version: '1.3.0',
    description: 'Get current weather and forecasts via wttr.in or Open-Meteo.',
    tags: ['weather', 'forecast'],
    icon: '🌤️',
    triggers: ['weather', 'forecast', 'temperature'],
    tools: ['curl'],
    platforms: ['claude', 'openclaw'],
  },
  {
    name: 'skill-validator',
    version: '1.0.0',
    description: 'Validate skill definitions and SKILL.md files.',
    tags: ['skill', 'validation', 'development'],
    icon: '✅',
    triggers: ['validate', 'skill'],
    tools: ['fs', 'yaml'],
    platforms: ['hundunos'],
  },
  {
    name: 'platform-bridge',
    version: '1.0.0',
    description: 'Cross-platform skill distribution for Claude, Cursor, Windsurf, and more.',
    tags: ['platform', 'distribution', 'sync'],
    icon: '🌉',
    triggers: ['platform', 'install', 'publish'],
    tools: ['fs', 'json'],
    platforms: ['claude', 'cursor', 'windsurf', 'openclaw', 'hundunos'],
  },
]

const platforms = [
  { id: 'claude', name: 'Claude Code', icon: '🤖', type: 'skill-md' },
  { id: 'claude-desktop', name: 'Claude Desktop', icon: '🖥️', type: 'mcp' },
  { id: 'cursor', name: 'Cursor', icon: '🔵', type: 'mcp' },
  { id: 'windsurf', name: 'Windsurf', icon: '🌊', type: 'mcp' },
  { id: 'openclaw', name: 'OpenClaw', icon: '🦀', type: 'skill-md' },
  { id: 'hundunos', name: 'HundunOS', icon: '🎓', type: 'skill-md' },
]

// Components
function SkillCard({ skill, onClick }) {
  return (
    <div className="skill-card" onClick={() => onClick(skill)}>
      <div className="skill-card-header">
        <div className="skill-icon">{skill.icon}</div>
        <div>
          <div className="skill-name">{skill.name}</div>
          <div className="skill-version">v{skill.version}</div>
        </div>
      </div>
      <div className="skill-description">{skill.description}</div>
      <div className="skill-tags">
        {skill.tags.map(tag => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>
    </div>
  )
}

function SkillList({ skills, onSelectSkill }) {
  const [search, setSearch] = useState('')
  
  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(search.toLowerCase()) ||
    skill.description.toLowerCase().includes(search.toLowerCase()) ||
    skill.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
  )
  
  return (
    <>
      <div className="search-container">
        <Search className="search-icon" size={18} />
        <input
          className="search-input"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="skill-grid">
        {filteredSkills.map(skill => (
          <SkillCard key={skill.name} skill={skill} onClick={onSelectSkill} />
        ))}
      </div>
    </>
  )
}

function SkillEditor({ skill, onClose, onPublish }) {
  const [content, setContent] = useState(`---
name: ${skill?.name || 'my-skill'}
version: ${skill?.version || '1.0.0'}
description: ${skill?.description || ''}
tags: [${skill?.tags?.join(', ') || ''}]
---

# System Prompt

You are a helpful assistant.
`)
  
  const [selectedPlatforms, setSelectedPlatforms] = useState(
    skill?.platforms || ['claude']
  )
  
  const togglePlatform = (id) => {
    setSelectedPlatforms(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id]
    )
  }
  
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Edit Skill: {skill?.name || 'New Skill'}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="editor-container">
            <textarea
              style={{
                width: '100%',
                height: '100%',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: 'none',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '14px',
                resize: 'none',
              }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          
          <h4 style={{ marginTop: 20, marginBottom: 12 }}>Publish to Platforms</h4>
          <div className="platform-grid">
            {platforms.map(platform => (
              <div
                key={platform.id}
                className={`platform-card ${selectedPlatforms.includes(platform.id) ? 'selected' : ''}`}
                onClick={() => togglePlatform(platform.id)}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>{platform.icon}</div>
                <div style={{ fontWeight: 500 }}>{platform.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{platform.type}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onPublish(content, selectedPlatforms)}
          >
            <Upload size={16} />
            Publish
          </button>
        </div>
      </div>
    </div>
  )
}

function PlatformSelector({ installedPlatforms, onDetect }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Detected Platforms</h3>
        <button className="btn btn-secondary" onClick={onDetect}>
          <Play size={16} />
          Detect
        </button>
      </div>
      <div className="platform-grid">
        {platforms.map(platform => (
          <div
            key={platform.id}
            className={`platform-card ${installedPlatforms.includes(platform.id) ? 'installed' : ''}`}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>{platform.icon}</div>
            <div style={{ fontWeight: 500 }}>{platform.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {installedPlatforms.includes(platform.id) ? 'Installed' : 'Not detected'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VersionTimeline({ skillName }) {
  const versions = [
    { version: '2.1.0', date: '2026-04-09', message: 'Added code review support', current: true },
    { version: '2.0.0', date: '2026-04-01', message: 'Major refactor with MCP support' },
    { version: '1.5.0', date: '2026-03-15', message: 'Added CI/CD integration' },
    { version: '1.0.0', date: '2026-02-01', message: 'Initial release' },
  ]
  
  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>Version History: {skillName}</h3>
      <div className="timeline">
        {versions.map(v => (
          <div key={v.version} className={`timeline-item ${v.current ? 'current' : ''}`}>
            <div>
              <span className="timeline-version">{v.version}</span>
              <span className="timeline-date">{v.date}</span>
            </div>
            <div className="timeline-message">{v.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Sidebar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'skills', label: 'Skills', icon: <Download size={18} /> },
    { id: 'platforms', label: 'Platforms', icon: <Settings size={18} /> },
    { id: 'versions', label: 'Versions', icon: <GitBranch size={18} /> },
    { id: 'sync', label: 'Sync', icon: <Cloud size={18} /> },
    { id: 'cli', label: 'CLI', icon: <Terminal size={18} /> },
  ]
  
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>HundunOS Skills</h1>
      </div>
      <nav className="sidebar-nav">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        HundunOS v3.9.0
      </div>
    </div>
  )
}

// Main App
export default function App() {
  const [activeTab, setActiveTab] = useState('skills')
  const [skills, setSkills] = useState(mockSkills)
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [installedPlatforms, setInstalledPlatforms] = useState(['claude', 'openclaw', 'hundunos'])
  
  const handleSelectSkill = (skill) => {
    setSelectedSkill(skill)
    setShowEditor(true)
  }
  
  const handlePublish = (content, platforms) => {
    console.log('Publishing to:', platforms)
    console.log('Content:', content)
    setShowEditor(false)
    setSelectedSkill(null)
    // In real app, call API
  }
  
  const handleDetectPlatforms = () => {
    // In real app, call API
    setInstalledPlatforms(['claude', 'cursor', 'openclaw', 'hundunos'])
  }
  
  const renderContent = () => {
    switch (activeTab) {
      case 'skills':
        return <SkillList skills={skills} onSelectSkill={handleSelectSkill} />
      case 'platforms':
        return <PlatformSelector installedPlatforms={installedPlatforms} onDetect={handleDetectPlatforms} />
      case 'versions':
        return <VersionTimeline skillName={selectedSkill?.name || 'github-helper'} />
      case 'sync':
        return (
          <div className="empty-state">
            <div className="empty-state-icon">☁️</div>
            <h3>WebDAV Sync</h3>
            <p style={{ marginTop: 8 }}>Configure WebDAV to sync skills across devices</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }}>
              <Cloud size={16} />
              Configure WebDAV
            </button>
          </div>
        )
      case 'cli':
        return (
          <div>
            <h3 style={{ marginBottom: 16 }}>CLI Commands</h3>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 14 }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}># Install a skill</div>
              <div style={{ marginBottom: 16 }}>hundunos-skill install https://example.com/skill.yaml</div>
              
              <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}># Publish to Claude</div>
              <div style={{ marginBottom: 16 }}>hundunos-skill publish my-skill claude</div>
              
              <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}># List skills</div>
              <div style={{ marginBottom: 16 }}>hundunos-skill list --platform cursor</div>
              
              <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}># Validate a skill</div>
              <div style={{ marginBottom: 16 }}>hundunos-skill validate ./my-skill</div>
            </div>
          </div>
        )
      default:
        return null
    }
  }
  
  return (
    <div className="app">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main">
        <header className="header">
          <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
          {activeTab === 'skills' && (
            <button className="btn btn-primary" onClick={() => { setSelectedSkill(null); setShowEditor(true); }}>
              <Plus size={16} />
              New Skill
            </button>
          )}
        </header>
        <div className="content">
          {renderContent()}
        </div>
      </main>
      {showEditor && (
        <SkillEditor
          skill={selectedSkill}
          onClose={() => { setShowEditor(false); setSelectedSkill(null); }}
          onPublish={handlePublish}
        />
      )}
    </div>
  )
}
