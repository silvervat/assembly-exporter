# Testing Guide for OpenAI API Key Support

## Manual Testing Checklist

### Settings Tab Tests

#### 1. OpenAI API Key Input
- [ ] Open Settings tab
- [ ] Verify OpenAI API Key section is visible with orange background
- [ ] Enter a test API key (e.g., "sk-test123")
- [ ] Verify key is masked by default (shows dots)
- [ ] Click eye button and verify key is revealed
- [ ] Wait 3 seconds and verify key is automatically masked again
- [ ] Verify eye button background changes to red when revealing

#### 2. Session Storage Checkbox
- [ ] Check the "Save for session" checkbox
- [ ] Reload the page
- [ ] Verify API key is still present (loaded from sessionStorage)
- [ ] Uncheck the "Save for session" checkbox
- [ ] Reload the page
- [ ] Verify API key is cleared (not persisted)

#### 3. Security Note
- [ ] Verify security warning is visible below the checkbox
- [ ] Verify it contains warning emoji and mentions webhook recommendation
- [ ] Verify text is in correct language (ET or EN based on selected language)

### Scan Tab Tests

#### 4. Webhook Path (Existing Behavior)
- [ ] Configure webhook URL and secret in Settings
- [ ] Go to Scan tab
- [ ] Upload an image
- [ ] Click "Run OCR"
- [ ] Verify webhook is called (existing behavior should work unchanged)

#### 5. OpenAI API Fallback Path
- [ ] Clear webhook URL in Settings
- [ ] Enter OpenAI API key in Settings (check "Save for session")
- [ ] Go to Scan tab
- [ ] Upload an image
- [ ] Click "Run OCR"
- [ ] Verify OpenAI API is called
- [ ] Verify OCR results are returned

#### 6. Error Handling
- [ ] Clear both webhook URL and API key
- [ ] Go to Scan tab
- [ ] Upload an image
- [ ] Click "Run OCR"
- [ ] Verify error message: "OCR pole seadistatud! Lisa webhook URL või OpenAI API võti seadetes."

### Storage Tests

#### 7. localStorage Behavior
- [ ] Open browser DevTools → Application → Local Storage
- [ ] View "assemblyExporterSettings"
- [ ] Verify `openaiApiKey` is NOT present in localStorage
- [ ] Verify `openaiRemember` is NOT present in localStorage
- [ ] Verify other settings (language, colors, etc.) ARE present

#### 8. sessionStorage Behavior
- [ ] Open browser DevTools → Application → Session Storage
- [ ] Check "Save for session" checkbox with an API key
- [ ] Verify "assemblyExporterOpenaiKey" is present in sessionStorage
- [ ] Close browser tab and reopen
- [ ] Verify API key is cleared (sessionStorage is empty)

## Automated Testing

### Unit Tests (Future Enhancement)

```javascript
// Test useSettings hook
describe('useSettings', () => {
  it('should not store openaiApiKey in localStorage', () => {
    // Test that sensitive data is excluded from localStorage
  });

  it('should store openaiApiKey in sessionStorage when openaiRemember is true', () => {
    // Test sessionStorage saving
  });

  it('should clear openaiApiKey from sessionStorage when openaiRemember is false', () => {
    // Test sessionStorage clearing
  });
});

// Test runGptOcr function
describe('runGptOcr', () => {
  it('should use webhook when ocrWebhookUrl is configured', async () => {
    // Test webhook path
  });

  it('should use OpenAI API when only openaiApiKey is configured', async () => {
    // Test OpenAI fallback path
  });

  it('should throw error when neither webhook nor API key is configured', async () => {
    // Test error handling
  });

  it('should timeout after 30 seconds', async () => {
    // Test timeout behavior
  });

  it('should parse OpenAI response in multiple formats', async () => {
    // Test response parsing
  });
});
```

## Integration Tests

### Test with Mock OpenAI API

```javascript
// Mock fetch to simulate OpenAI API response
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{
        message: {
          content: "Mark\tQty\tProfile\nB-101\t3\tHEA 200"
        }
      }]
    })
  })
);

// Test that ScanApp calls OpenAI API correctly
// Verify headers include Authorization Bearer token
// Verify request body includes correct model and image
```

## Security Testing

### 1. Storage Inspection
- [ ] Verify no API keys in localStorage
- [ ] Verify API keys only in sessionStorage when explicitly opted in
- [ ] Verify secrets are cleared when browser closes

### 2. Network Inspection
- [ ] Open DevTools → Network tab
- [ ] Trigger OCR with OpenAI API
- [ ] Verify Authorization header is present in request
- [ ] Verify API key is sent securely (HTTPS)
- [ ] Verify no API keys are logged to console

### 3. Cross-Site Scripting (XSS) Protection
- [ ] Try entering JavaScript code in API key field
- [ ] Verify it's treated as plain text (not executed)

## Performance Testing

### 1. Timeout Verification
- [ ] Mock a slow OpenAI API response (> 30 seconds)
- [ ] Verify request is aborted after 30 seconds
- [ ] Verify appropriate error message is shown

### 2. Response Handling
- [ ] Test with large image files (> 5MB)
- [ ] Verify reasonable response time
- [ ] Verify no memory leaks or performance issues

## Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Verify:
- [ ] sessionStorage works correctly
- [ ] Eye button animation works
- [ ] Styling appears correct
- [ ] All functionality works as expected
