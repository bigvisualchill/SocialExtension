# Social Media Automation Chrome Extension

A Chrome extension that automates social media interactions using natural browser interactions. This extension supports Facebook, Twitter/X, Instagram, LinkedIn, and YouTube.

## Features

- **Create Posts**: Automatically generate and post content to your social media accounts
- **Respond to Comments**: Automatically respond to comments on your posts
- **Search and Comment**: Search for posts and automatically comment on them
- **Follow Users**: Automatically follow users based on your criteria
- **Natural Interactions**: Uses realistic delays and human-like typing patterns
- **Multiple Platforms**: Supports Facebook, Twitter/X, Instagram, LinkedIn, and YouTube
- **Customizable Settings**: Adjust action delays and maximum actions per session
- **Activity Logging**: Track all automation activities with detailed logs

## Installation

### Method 1: Load as Unpacked Extension (Recommended for Development)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The extension should now appear in your extensions list

### Method 2: Build and Install

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd social-media-automation-extension
   ```

2. Install dependencies (if any):
   ```bash
   npm install
   ```

3. Build the extension (if needed):
   ```bash
   npm run build
   ```

4. Follow the "Load as Unpacked Extension" steps above

## Usage

### Basic Usage

1. **Navigate to a supported social media platform** (Facebook, Twitter, Instagram, LinkedIn, or YouTube)
2. **Click the extension icon** in your Chrome toolbar
3. **Select your platform** from the dropdown menu
4. **Choose an action**:
   - **Create Post**: Automatically creates a new post
   - **Respond to Comments**: Responds to comments on your posts
   - **Search & Comment**: Searches for posts and comments on them
   - **Follow Users**: Follows users automatically

### Settings

- **Action Delay**: Time between actions (500-5000ms)
- **Max Actions**: Maximum number of actions per session (1-50)

### Advanced Usage

#### Context Menu
Right-click on any page of a supported social media platform to access quick actions:
- Create Post
- Respond to Comments
- Search & Comment
- Follow Users

#### Keyboard Shortcuts
- `Ctrl+Shift+A` (or `Cmd+Shift+A` on Mac): Toggle automation
- `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac): Quick post

## Supported Platforms

### Facebook
- Create posts on your timeline
- Respond to comments on your posts
- Search for posts and comment
- Follow pages and users

### Twitter/X
- Create tweets
- Reply to tweets
- Search for tweets and reply
- Follow users

### Instagram
- Create posts with captions
- Respond to comments
- Search for posts and comment
- Follow users

### LinkedIn
- Create posts
- Respond to comments
- Search for posts and comment
- Follow users and companies

### YouTube
- Create community posts
- Respond to comments
- Search for videos and comment
- Subscribe to channels

## Safety and Best Practices

### Rate Limiting
- The extension includes built-in delays to avoid triggering rate limits
- Adjust the "Action Delay" setting to be more conservative if needed
- Respect platform-specific limits and guidelines

### Content Guidelines
- Generated content is designed to be positive and engaging
- Avoid using the extension for spam or inappropriate content
- Follow each platform's terms of service

### Privacy
- The extension only operates on the social media platforms you visit
- No personal data is collected or transmitted
- All automation happens locally in your browser

## Technical Details

### Architecture
- **Manifest V3**: Uses the latest Chrome extension manifest version
- **Content Scripts**: Inject automation logic into social media pages
- **Background Service Worker**: Handles extension lifecycle and communication
- **Popup Interface**: User-friendly control panel

### Automation Engine
- **Natural Interactions**: Simulates human-like behavior with realistic delays
- **Element Detection**: Uses CSS selectors to find page elements
- **Error Handling**: Graceful handling of missing elements or network issues
- **Logging**: Comprehensive activity logging for debugging

### Security
- **Minimal Permissions**: Only requests necessary permissions
- **Host Restrictions**: Only operates on specified social media domains
- **No Data Collection**: Doesn't collect or transmit personal information

## Troubleshooting

### Common Issues

1. **Extension not working on a platform**
   - Ensure you're on a supported social media platform
   - Check that the page has fully loaded
   - Try refreshing the page

2. **Actions not completing**
   - Increase the "Action Delay" setting
   - Check your internet connection
   - Verify you're logged into the social media platform

3. **Elements not found**
   - Social media platforms frequently update their interfaces
   - The extension may need updates for new selectors
   - Check the console for error messages

### Debug Mode
1. Open Chrome DevTools (F12)
2. Go to the Console tab
3. Look for messages starting with `[Social Media Automation]`
4. Check for any error messages

## Development

### Project Structure
```
social-media-automation-extension/
├── manifest.json          # Extension manifest
├── popup.html            # Popup interface
├── popup.css             # Popup styles
├── popup.js              # Popup logic
├── content.js            # Content script (automation engine)
├── background.js         # Background service worker
├── icons/                # Extension icons
└── README.md             # This file
```

### Adding New Platforms
1. Update `manifest.json` with new host permissions
2. Add platform detection in `content.js`
3. Create platform-specific selectors in `getSelectors()`
4. Test thoroughly on the new platform

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Legal Disclaimer

This extension is provided for educational and personal use only. Users are responsible for:
- Complying with each social media platform's terms of service
- Using the extension responsibly and ethically
- Not violating any laws or regulations
- Respecting other users' privacy and rights

The developers are not responsible for any misuse of this extension or any consequences that may arise from its use.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or contributions:
1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed information
4. Include browser version, platform, and error messages

## Changelog

### Version 1.0.0
- Initial release
- Support for Facebook, Twitter/X, Instagram, LinkedIn, and YouTube
- Basic automation features (create posts, respond to comments, search and comment, follow users)
- Customizable settings and activity logging
- Modern UI with popup interface
