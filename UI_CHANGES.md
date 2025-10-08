# UI Changes Documentation

## OpenAI API Key Settings Section

### Location
The new OpenAI API Key section is located in the Settings tab, after the OCR Prompt field.

### Visual Design
The section has:
- **Background**: Light amber (#fffbeb) with orange border (#f59e0b)
- **Purpose**: Visually distinct warning color to emphasize security considerations

### Components

#### 1. OpenAI API Key Input Field
- **Type**: Password input (masked by default)
- **Placeholder**: "sk-..."
- **Label**: "OpenAI API võti" (ET) / "OpenAI API Key" (EN)
- **Layout**: Flex row with input taking full width and eye button on right

#### 2. Eye Reveal Button (👁️)
- **Icon**: Eye emoji (👁️)
- **Size**: 36px x 32px
- **Behavior**: 
  - On mousedown: Reveals the API key (changes input type from password to text)
  - Auto-hides after 3 seconds
  - Background changes from light gray to light red when revealing
- **Purpose**: Allows temporary viewing of API key while minimizing exposure time

#### 3. "Save for session" Checkbox
- **Label**: "Salvesta sessiooniks" (ET) / "Save for session" (EN)
- **Size**: 16px x 16px
- **Behavior**: 
  - When checked: API key is saved to sessionStorage
  - When unchecked: API key is NOT saved (must be re-entered each time)
- **Purpose**: Gives user explicit control over whether to persist the key

#### 4. Security Warning Note
- **Text (ET)**: "⚠️ API võti salvestatakse ainult sessiooniks (kaob brauseri sulgemisel). Soovitame kasutada webhook-i."
- **Text (EN)**: "⚠️ API key saved only for session (cleared when browser closes). We recommend using webhook approach."
- **Style**: Small text (11px), gray color, 1.4 line height
- **Icon**: Warning emoji (⚠️)
- **Purpose**: Educates users about security implications

### Code Implementation

```tsx
{/* OpenAI API Key Section */}
<div style={{ 
  padding: 12, 
  border: "1px solid #f59e0b", 
  borderRadius: 10, 
  background: "#fffbeb", 
  marginTop: 8 
}}>
  <div style={c.row}>
    <label style={c.label}>{t.openaiApiKey}</label>
    <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>
      <input 
        type={showOpenaiKey ? "text" : "password"} 
        value={settings.openaiApiKey || ""} 
        onChange={e => updateSettings({ openaiApiKey: e.target.value })} 
        placeholder="sk-..." 
        style={{ ...c.input, flex: 1 }} 
      />
      <button
        style={{
          ...c.miniBtn,
          width: 36,
          height: 32,
          padding: 0,
          background: showOpenaiKey ? "#fef2f2" : "#f6f8fb",
          borderColor: showOpenaiKey ? "#fca5a5" : "#cfd6df",
        }}
        onMouseDown={() => {
          setShowOpenaiKey(true);
          setTimeout(() => setShowOpenaiKey(false), 3000);
        }}
        title="Reveal for 3 seconds"
      >
        {t.revealKey}
      </button>
    </div>
  </div>
  <div style={{ ...c.row, marginTop: 8 }}>
    <label style={{ ...c.label, width: "auto" }}></label>
    <label style={{ 
      display: "flex", 
      alignItems: "center", 
      gap: 6, 
      cursor: "pointer", 
      fontSize: 12 
    }}>
      <input
        type="checkbox"
        checked={settings.openaiRemember || false}
        onChange={e => updateSettings({ openaiRemember: e.target.checked })}
        style={{ cursor: "pointer", width: 16, height: 16 }}
      />
      {t.openaiRemember}
    </label>
  </div>
  <div style={{ 
    fontSize: 11, 
    opacity: 0.7, 
    marginTop: 8, 
    lineHeight: 1.4 
  }}>
    {t.openaiSecurityNote}
  </div>
</div>
```

### User Experience Flow

1. **User opens Settings tab**
   - Sees new orange-highlighted section for OpenAI API Key

2. **User enters API key**
   - Key is automatically masked (shows as dots)
   - Can click eye button to temporarily reveal (3 seconds)

3. **User decides on persistence**
   - If checkbox unchecked (default): Key not saved, must re-enter next session
   - If checkbox checked: Key saved to sessionStorage, persists until browser close

4. **User reads security note**
   - Understands that webhook is recommended
   - Knows that key is only saved for session, not permanently

### Security Features

1. **Minimal Exposure**: Eye button reveals key for only 3 seconds
2. **No Permanent Storage**: Keys never saved to localStorage
3. **Explicit Opt-in**: User must check box to enable session storage
4. **Visual Warnings**: Orange color scheme indicates security considerations
5. **Educational**: Security note explains risks and best practices

## Backend Changes (ScanApp.tsx)

### Dual-Path OCR Support

The scanner now supports two methods for OCR:

1. **Webhook Path (Recommended)**
   - Used when `ocrWebhookUrl` is configured
   - Keeps API keys on server side
   - Same behavior as before

2. **OpenAI API Path (Fallback)**
   - Used when `openaiApiKey` is configured but no webhook
   - Direct call to OpenAI Chat Completions API
   - Uses `gpt-4o` model for vision tasks
   - 30-second timeout protection
   - Supports multiple response formats

### Error Messages

- If neither configured: "OCR pole seadistatud! Lisa webhook URL või OpenAI API võti seadetes."
- If API error: Shows specific error message from OpenAI API

## Translation Support

Both Estonian (ET) and English (EN) translations are provided for all new strings:

- `openaiApiKey`: "OpenAI API võti" / "OpenAI API Key"
- `openaiRemember`: "Salvesta sessiooniks" / "Save for session"
- `openaiSecurityNote`: Warning text about session storage
- `revealKey`: "👁️" (emoji, no translation needed)
