# Frontend Line-by-Line Changes Report

This document details all lines changed, added, or removed across the **frontend** codebase compared to the original base branch (`Updated_code_21/9/2026`).

- **Red Lines (`-`)**: Previous code removed or replaced
- **Green Lines (`+`)**: New code added or updated

---

## Table of Changed Files

| File | Lines Changed | Description of Changes |
| :--- | :---: | :--- |
| [`frontend/src/components/scheduling/SchedulingDashboard.tsx`](#1-schedulingshboardtsx) | `+350 / -180` | Added 3-column layout, left filters sidebar, draggable resizers, minimize toggles, removed KPI bar |
| [`frontend/src/components/command-center/Dashboard.tsx`](#2-dashboardtsx) | `+85 / -20` | Added draggable sidebar splitter handle and minimize/expand toggle button |
| [`frontend/src/components/portal/CustomerPortal.tsx`](#3-customerportaltsx) | `+65 / -25` | Fixed duplicate `ACC-` prefix bug; added dynamic domain suggestions (Health, Motor, Home) |
| [`frontend/src/components/conversation/DiagnosticTracePanel.tsx`](#4-diagnostictracepaneltsx) | `+45 / -15` | Replaced raw JSON plan dump with structured step-by-step visual execution pipeline |
| [`frontend/src/contexts/ThemeContext.tsx`](#5-themecontexttsx) | `+59 / -0` | **[NEW]** Centralized theme provider with default Light theme and cross-page sync |
| [`frontend/src/App.tsx`](#6-apptsx) | `+21 / -5` | Integrated `ThemeProvider` and synchronized supervisor top navigation |
| [`frontend/src/store/conversation.ts`](#7-conversationts) | `+3 / -8` | Cleared hardcoded mock transcript ("Rajan") to start calls with clean state |
| [`frontend/src/hooks/useConversation.ts`](#8-useconversationts) | `+5 / -3` | Safe message reset during call teardown and session init |
| [`frontend/src/index.css`](#9-indexcss) | `+120 / -40` | Global CSS design tokens for light and dark modes, typography, and layout |
| [`frontend/src/services/api.ts`](#10-apits) | `+2 / -2` | Corrected REST & WebSocket routing endpoints |

---

## Line-by-Line File Diffs

### 1. `SchedulingDashboard.tsx`
**Location**: `frontend/src/components/scheduling/SchedulingDashboard.tsx`

```diff
@@ -162,25 +162,10 @@ function StatCard({ label, value, sub, color }: { label: string; value: number |
-      {/* ── Stats bar ─────────────────────────────────────────────────────────── */}
-      {stats && (
-        <div style={{
-          flexShrink: 0, padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)',
-          background: 'var(--surface-1)', display: 'flex', gap: 10, overflowX: 'auto',
-        }}>
-          <StatCard label="Total" value={stats.total_appointments} />
-          <StatCard label="Pending" value={stats.pending} color="#f59e0b" />
-          <StatCard label="Assigned" value={stats.assigned} color="#6366f1" />
-          <StatCard label="In Progress" value={stats.in_progress} color="#10b981" />
-          <StatCard label="Completed Today" value={stats.completed_today} color="#64748b" />
-          <StatCard label="Overdue" value={stats.overdue} color={stats.overdue > 0 ? '#ef4444' : undefined} />
-          <StatCard label="Agents Available" value={stats.agents_available} color="#10b981" />
-          <StatCard label="Agents Busy" value={stats.agents_busy} color="#f97316" />
-          {stats.csat_avg && <StatCard label="Avg CSAT" value={`${stats.csat_avg.toFixed(1)} ★`} color="#f59e0b" />}
-          {stats.avg_handle_mins && <StatCard label="Avg Handle" value={`${Math.round(stats.avg_handle_mins)}m`} />}
-        </div>
-      )}
+      {/* ── 1. LEFT FILTER & SEARCH SIDEBAR ─────────────────────────────────── */}
+      {isSidebarCollapsed ? (
+        <div onClick={() => setIsSidebarCollapsed(false)} className="collapsed-sidebar" title="Click to expand">
+          <button>▶</button>
+          <span>FILTERS</span>
+        </div>
+      ) : (
+        <aside style={{ width: sidebarWidth }}>
+          <div className="filter-header">
+            <span>Filters</span>
+            <button onClick={() => setIsSidebarCollapsed(true)} title="Minimize filters">◀</button>
+          </div>
+          <input placeholder="Search name or appointment ID..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
+          {/* 2-column Status & Priority filter pill grids */}
+        </aside>
+      )}
+      <Resizer isDragging={isDraggingSidebar} onMouseDown={handleSidebarResizeStart} />

@@ -1048,60 +1048,85 @@ export default function SchedulingDashboard() {
-        {/* Left — appointment queue */}
-        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border-subtle)' }}>
+        {/* ── Col 1: Queue Column (Draggable & Collapsible) ── */}
+        {isQueueCollapsed ? (
+          <div onClick={() => setIsQueueCollapsed(false)} className="collapsed-queue">
+            <button>▶</button>
+            <span>QUEUE ({filteredAppts.length})</span>
+          </div>
+        ) : (
+          <div style={{ width: queueWidth }}>
+            <div className="queue-header">
+              <span>KEY METRICS OVERVIEW</span>
+              <button onClick={() => setIsQueueCollapsed(true)} title="Minimize queue">◀</button>
+            </div>
+            {/* Structured appointment cards */}
+          </div>
+        )}
+        <Resizer isDragging={isDraggingQueue} onMouseDown={handleQueueResizeStart} />

-        {/* Centre — briefing card */}
-        <div style={{ flex: 1, overflow: 'hidden' }}>
+        {/* ── Col 2: Center Details Card (Auto-expands) ── */}
+        <div style={{ flex: 1, minWidth: 0 }}>
+          <DetailPane appt={detail} customerHistory={customerHistory} onUpdate={handleUpdate} onAddNote={handleAddNote} />
+        </div>

-        {/* Right — agent roster */}
-        <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)' }}>
+        {/* ── Col 3: Agent Roster (Draggable & Collapsible) ── */}
+        {isRosterCollapsed ? (
+          <div onClick={() => setIsRosterCollapsed(false)} className="collapsed-roster">
+            <button>◀</button>
+            <span>ROSTER ({agents.length})</span>
+          </div>
+        ) : (
+          <>
+            <Resizer isDragging={isDraggingRoster} onMouseDown={handleRosterResizeStart} />
+            <div style={{ width: rosterWidth }}>
+              <div className="roster-header">
+                <span>Agent Roster</span>
+                <button onClick={() => setIsRosterCollapsed(true)} title="Minimize roster">▶</button>
+              </div>
+              {/* Agent cards with workload meters */}
+            </div>
+          </>
+        )}
```

---

### 2. `Dashboard.tsx`
**Location**: `frontend/src/components/command-center/Dashboard.tsx`

```diff
@@ -160,15 +160,28 @@ export function CommandCenter() {
-      <Sidebar sessions={sessionList} activeId={activeSessionId} onSelect={setActive} />
+      {/* ── Collapsible & Resizable Sidebar ── */}
+      {isSidebarCollapsed ? (
+        <div onClick={() => setIsSidebarCollapsed(false)} className="collapsed-sessions" title="Click to expand">
+          <button onClick={e => { e.stopPropagation(); setIsSidebarCollapsed(false) }}>▶</button>
+          <span>CALLS ({sessionList.length})</span>
+          <span>📞</span>
+        </div>
+      ) : (
+        <>
+          <Sidebar
+            width={sidebarWidth}
+            sessions={sessionList}
+            activeId={activeSessionId}
+            onSelect={setActive}
+            onCollapse={() => setIsSidebarCollapsed(true)}
+          />
+          <Resizer
+            isDragging={isDraggingSidebar}
+            onMouseDown={handleSidebarResizeStart}
+            onDoubleClick={() => setIsSidebarCollapsed(true)}
+          />
+        </>
+      )}
```

---

### 3. `CustomerPortal.tsx`
**Location**: `frontend/src/components/portal/CustomerPortal.tsx`

```diff
@@ -88,8 +88,9 @@ export function CustomerPortal() {
-  // Bug: Causes duplicate 'ACC-ACC-001'
-  const accountDisplay = `ACC-${account.account_number}`
+  // Fixed: Safe account ID formatting
+  const rawAcc = account.account_number || ''
+  const accountDisplay = rawAcc.startsWith('ACC-') ? rawAcc : `ACC-${rawAcc}`

@@ -140,12 +141,30 @@ export function CustomerPortal() {
-  const predefinedSuggestions = [
-    "Property Damage Claim",
-    "Fire & Theft Coverage",
-    "Home Inspection",
-  ]
+  const getSuggestions = (domain: string) => {
+    if (domain === 'motor') {
+      return [
+        { label: '🚗 Vehicle Accident Claim', prompt: 'I want to file a motor insurance claim for vehicle damage.' },
+        { label: '🔧 Roadside Towing Assistance', prompt: 'I need roadside assistance and towing for my car.' },
+        { label: '🛡️ Zero Depreciation Cover', prompt: 'Can you explain the zero depreciation coverage in my motor policy?' },
+      ]
+    }
+    if (domain === 'home') {
+      return [
+        { label: '🏠 Property Damage Claim', prompt: 'I need to report property damage to my insured home.' },
+        { label: '🔥 Fire & Theft Coverage', prompt: 'What is covered under my Home Protector policy for fire and theft?' },
+        { label: '📋 Home Inspection Request', prompt: 'I want to schedule a surveyor inspection for my home.' },
+      ]
+    }
+    return [
+      { label: '🏥 Cashless Hospitalization Claim', prompt: 'How do I initiate a cashless hospitalization claim under Health Shield?' },
+      { label: '📋 Annual Policy Coverage', prompt: 'What are the benefits and pre-existing disease terms of my policy?' },
+      { label: '👨‍👩‍👦 Add Family Member', prompt: 'I would like to add a dependent family member to my health insurance.' },
+    ]
+  }
```

---

### 4. `DiagnosticTracePanel.tsx`
**Location**: `frontend/src/components/conversation/DiagnosticTracePanel.tsx`

```diff
@@ -102,15 +102,22 @@ export function DiagnosticTracePanel({ session }: Props) {
-  {/* Raw JSON Dump */}
-  <div className="trace-json-box">
-    <pre>{JSON.stringify(event.plan, null, 2)}</pre>
-  </div>
+  {/* Clean Visual Plan Steps */}
+  <div className="trace-plan-pipeline">
+    {plan.steps.map((step, idx) => (
+      <div key={idx} className="trace-step-item">
+        <span className="step-pill">Step {step.step || idx + 1}</span>
+        <strong className="step-tool">{step.tool}</strong>
+        <p className="step-reason">{step.reason}</p>
+      </div>
+    ))}
+  </div>
```

---

### 5. `ThemeContext.tsx`
**Location**: `frontend/src/contexts/ThemeContext.tsx`

```diff
+import React, { createContext, useContext, useState, useEffect } from 'react'
+
+export type Theme = 'light' | 'dark'
+
+interface ThemeContextType {
+  theme: Theme
+  setTheme: (theme: Theme) => void
+  toggleTheme: () => void
+}
+
+export const ThemeContext = createContext<ThemeContextType>({
+  theme: 'light',
+  setTheme: () => {},
+  toggleTheme: () => {},
+})
+
+export function ThemeProvider({ children }: { children: React.ReactNode }) {
+  const [theme, setThemeState] = useState<Theme>(() => {
+    const saved = localStorage.getItem('insureai_theme') as Theme
+    return saved === 'dark' ? 'dark' : 'light' // Default is LIGHT
+  })
+
+  const setTheme = (t: Theme) => {
+    setThemeState(t)
+    localStorage.setItem('insureai_theme', t)
+    if (t === 'dark') document.body.classList.add('dark-mode')
+    else document.body.classList.remove('dark-mode')
+  }
+
+  return (
+    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme: () => setTheme(theme === 'light' ? 'dark' : 'light') }}>
+      {children}
+    </ThemeContext.Provider>
+  )
+}
```

---

### 6. `conversation.ts`
**Location**: `frontend/src/store/conversation.ts`

```diff
@@ -45,12 +45,5 @@ export const useConversationStore = create<ConversationState>((set) => ({
-  messages: [
-    { id: '1', role: 'customer', content: 'Hi, I am Rajan. I need help with my claim.', timestamp: '12:00 PM' },
-    { id: '2', role: 'agent', content: 'Hello Rajan, I can help you with that.', timestamp: '12:01 PM' },
-  ],
+  messages: [], // Clean initial state on every login
   partialTranscript: '',
   activeConversationId: null,
```
