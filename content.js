class SocialMediaAutomationEngine {
    constructor() {
        this.isRunning = false;
        this.currentAction = null;
        this.settings = {};
        this.platform = '';
        this.actionCount = 0;
        this.maxActions = 10;
        this.commentDelay = 2; // seconds between comments
        this.actionDelay = 0.5; // seconds for UI interactions
        
        this.setupMessageListener();
        this.detectPlatform();
        this.checkForPendingTask();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Handle debug first to avoid routing to generic handler
            if (message.action === 'debug') {
                this.debugPage();
                sendResponse({ success: true });
                return true;
            }

            if (message.action === 'stop') {
                this.stopAutomation();
                sendResponse({ success: true });
                return true;
            }

            if (message.action) {
                this.handleAction(message, sendResponse);
                return true; // Keep message channel open for async response
            }
        });
    }

    detectPlatform() {
        const hostname = window.location.hostname;
        if (hostname.includes('facebook.com')) this.platform = 'facebook';
        else if (hostname.includes('twitter.com')) this.platform = 'twitter';
        else if (hostname.includes('instagram.com')) this.platform = 'instagram';

        else if (hostname.includes('youtube.com')) this.platform = 'youtube';
    }

    async handleAction(message, sendResponse) {
        try {
            this.currentAction = message.action;
            // Detect or set platform
            this.detectPlatform();
            this.platform = (message.platform && message.platform !== 'auto') ? message.platform : this.platform;
            this.settings = message.settings;
            this.commentDelay = this.settings.delay || 2; // seconds between comments
            this.actionDelay = 0.5; // seconds for UI interactions
            this.maxActions = this.settings.maxActions || 10;
            this.actionCount = 0;
            this.isRunning = true;

            this.log(`Starting ${this.currentAction} on ${this.platform}`);

            let result;
            switch (this.currentAction) {
                case 'createPost':
                    result = await this.createPost();
                    break;
                case 'respondToComments':
                    result = await this.respondToComments();
                    break;
                case 'searchAndComment':
                    result = await this.searchAndComment();
                    break;
                case 'followUsers':
                    result = await this.followUsers();
                    break;
                default:
                    throw new Error(`Unknown action: ${this.currentAction}`);
            }

            sendResponse({ success: true, result });
        } catch (error) {
            this.log(`Error in ${this.currentAction}: ${error.message}`, 'error');
            sendResponse({ success: false, error: error.message });
        } finally {
            this.isRunning = false;
            this.currentAction = null;
        }
    }

    async createPost() {
        const selectors = this.getSelectors('createPost');
        const { contentTopic, tone, useAi } = this.settings || {};
        
        this.log(`Looking for post area with selectors: ${selectors.postArea}`, 'info');
        
        // Find the post creation area
        const postArea = await this.waitForElement(selectors.postArea);
        if (!postArea) {
            this.log('Could not find post creation area. Trying alternative approach...', 'warning');
            
            // Try to find any textarea or contenteditable element
            const alternativeSelectors = [
                'textarea',
                '[contenteditable="true"]',
                'input[type="text"]',
                '[role="textbox"]'
            ];
            
            for (const altSelector of alternativeSelectors) {
                const element = document.querySelector(altSelector);
                if (element && element.offsetParent !== null) {
                    this.log(`Found alternative element: ${altSelector}`, 'success');
                    // Use this element instead
                    await this.safeClick(element);
                    await this.sleep(this.actionDelay);
                    
                    const postContent = this.generatePostContent();
                    await this.typeText(element, postContent);
                    await this.sleep(this.actionDelay);
                    
                    // Try to find a submit button
                    const submitSelectors = [
                        'button[type="submit"]',
                        'button:contains("Post")',
                        'button:contains("Tweet")',
                        'button:contains("Share")',
                        '[data-testid*="post"]',
                        '[data-testid*="tweet"]'
                    ];
                    
                    for (const submitSelector of submitSelectors) {
                        const submitBtn = document.querySelector(submitSelector);
                        if (submitBtn) {
                            this.log(`Found submit button: ${submitSelector}`, 'success');
                            await this.safeClick(submitBtn);
                            this.actionCount++;
                            this.log(`Created post #${this.actionCount} using alternative method`, 'success');
                            return { success: true, actionCount: this.actionCount };
                        }
                    }
                }
            }
            
            throw new Error('Could not find post creation area or submit button');
        }

        // Click to focus the post area
        await this.safeClick(postArea);
        await this.sleep(this.actionDelay);

        // Generate post content
        let postContent = this.generatePostContent();
        if (useAi && contentTopic) {
            try {
                const ai = await this.generateAiComment(`Create a social post about: ${contentTopic}. Tone: ${tone || 'concise, friendly'}. Platform: ${this.platform}.`);
                if (ai) postContent = ai;
            } catch (e) {
                this.log(`AI post generation failed: ${e.message}`, 'warning');
            }
        }
        await this.typeText(postArea, postContent);
        await this.sleep(this.actionDelay);

        // Find and click the post button
        this.log(`Looking for post button with selectors: ${selectors.postButton}`, 'info');
        const postButton = await this.waitForElement(selectors.postButton);
        if (!postButton) {
            throw new Error('Could not find post button');
        }

        await this.safeClick(postButton);
        this.actionCount++;
        this.log(`Created post #${this.actionCount}`);

        return { success: true, actionCount: this.actionCount };
    }

    async respondToComments() {
        const selectors = this.getSelectors('respondToComments');
        let respondedCount = 0;

        // Find comment sections
        const commentSections = document.querySelectorAll(selectors.commentSection);
        
        for (const section of commentSections) {
            if (this.actionCount >= this.maxActions) break;

            // Find reply buttons
            const replyButtons = section.querySelectorAll(selectors.replyButton);
            
            for (const replyBtn of replyButtons) {
                if (this.actionCount >= this.maxActions) break;

                try {
                    // Click reply button
                    await this.safeClick(replyBtn);
                    await this.sleep(this.actionDelay);

                    // Find comment input
                    const commentInput = await this.waitForElement(selectors.commentInput);
                    if (!commentInput) continue;

                    // Type response
                    const response = this.generateCommentResponse();
                    await this.typeText(commentInput, response);
                    await this.sleep(this.actionDelay);

                    // Submit comment
                    const submitButton = await this.waitForElement(selectors.submitButton);
                    if (submitButton) {
                        await this.safeClick(submitButton);
                        respondedCount++;
                        this.actionCount++;
                        this.log(`Responded to comment #${this.actionCount}`);
                    }

                    await this.sleep(this.commentDelay);
                } catch (error) {
                    this.log(`Error responding to comment: ${error.message}`, 'warning');
                }
            }
        }

        return { success: true, respondedCount, actionCount: this.actionCount };
    }

    async searchAndComment() {
        const selectors = this.getSelectors('searchAndComment');
        const { searchQuery, includeTerms, excludeTerms, useAi } = this.settings || {};
        
        // Special debugging for Instagram
        if (this.platform === 'instagram') {
            this.log('Instagram search debug - looking for input elements...', 'info');
            const allInputs = document.querySelectorAll('input');
            this.log(`Found ${allInputs.length} input elements on page`, 'info');
            
            allInputs.forEach((input, i) => {
                const placeholder = input.placeholder || '';
                const ariaLabel = input.getAttribute('aria-label') || '';
                const type = input.type || '';
                const className = input.className || '';
                this.log(`Input ${i}: placeholder="${placeholder}", aria-label="${ariaLabel}", type="${type}", class="${className}"`, 'info');
            });
        }
        
        // Find search input
        const searchInput = await this.waitForElement(selectors.searchInput);
        if (!searchInput) {
            // Additional debugging for Instagram
            if (this.platform === 'instagram') {
                this.log('Instagram search input not found, trying alternative approach...', 'warning');
                // Try to find any visible input that might be the search
                const visibleInputs = Array.from(document.querySelectorAll('input')).filter(input => 
                    input.offsetParent !== null && 
                    (input.placeholder.toLowerCase().includes('search') || 
                     input.getAttribute('aria-label')?.toLowerCase().includes('search'))
                );
                if (visibleInputs.length > 0) {
                    this.log(`Found ${visibleInputs.length} potential search inputs`, 'info');
                    return await this.continueSearchWithInput(visibleInputs[0], selectors, { searchQuery, includeTerms, excludeTerms, useAi });
                }
            }
            throw new Error('Could not find search input');
        }

        // Build search term from settings
        const searchTerm = (searchQuery && searchQuery.trim().length > 0)
            ? searchQuery.trim()
            : this.generateSearchTerm();
        await this.typeText(searchInput, searchTerm);
        await this.sleep(this.actionDelay);

        // Submit search
        const searchButton = await this.waitForElement(selectors.searchButton);
        if (searchButton) {
            await this.safeClick(searchButton);
        } else {
            // Try pressing Enter
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }

        await this.sleep(this.actionDelay);

        // Platform-specific flows when needed
        if (this.platform === 'youtube') {
            this.log('Navigating into first results to comment...', 'info');
            return await this.youtubeSearchAndComment({ selectors, includeTerms, excludeTerms, useAi });
        }

        // Find posts to comment on
        const posts = document.querySelectorAll(selectors.posts);
        let commentedCount = 0;

        for (const post of posts) {
            if (this.actionCount >= this.maxActions) break;

            try {
                // Extract post text for filtering and AI
                const postText = (post.innerText || post.textContent || '').slice(0, 800);
                if (!this.shouldCommentOnPost(postText, includeTerms, excludeTerms)) {
                    continue;
                }

                // Find comment button
                const commentButton = post.querySelector(selectors.commentButton);
                if (!commentButton) continue;

                await this.safeClick(commentButton);
                await this.sleep(this.actionDelay);

                // Find comment input
                const commentInput = await this.waitForElement(selectors.commentInput);
                if (!commentInput) continue;

                // Generate comment
                let comment = this.generateCommentResponse();
                if (useAi) {
                    try {
                        const ai = await this.generateAiComment(postText);
                        if (ai) comment = ai;
                    } catch (e) {
                        this.log(`AI comment failed: ${e.message}`, 'warning');
                    }
                }
                await this.typeText(commentInput, comment);
                await this.sleep(this.actionDelay);

                // Submit comment
                const submitButton = await this.waitForElement(selectors.submitButton);
                if (submitButton) {
                    await this.safeClick(submitButton);
                    commentedCount++;
                    this.actionCount++;
                    this.log(`Commented on post #${this.actionCount}`);
                }

                await this.sleep(this.commentDelay); // Delay between different comments
            } catch (error) {
                this.log(`Error commenting on post: ${error.message}`, 'warning');
            }
        }

        return { success: true, commentedCount, actionCount: this.actionCount };
    }

    async continueSearchWithInput(searchInput, selectors, { searchQuery, includeTerms, excludeTerms, useAi }) {
        // Build search term from settings
        const searchTerm = (searchQuery && searchQuery.trim().length > 0)
            ? searchQuery.trim()
            : this.generateSearchTerm();
        await this.typeText(searchInput, searchTerm);
        await this.sleep(this.actionDelay);

        // Submit search
        const searchButton = await this.waitForElement(selectors.searchButton);
        if (searchButton) {
            await this.safeClick(searchButton);
        } else {
            // Try pressing Enter
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }

        await this.sleep(this.actionDelay);

        // Platform-specific search handling
        if (this.platform === 'youtube') {
            return await this.youtubeSearchAndComment({ selectors, includeTerms, excludeTerms, useAi });
        }

        // Generic search and comment for other platforms
        await this.sleep(this.actionDelay);

        const posts = await this.waitForElement(selectors.posts);
        if (!posts) {
            throw new Error('No posts found after search');
        }

        const postElements = document.querySelectorAll(selectors.posts);
        let commentedCount = 0;

        for (let i = 0; i < Math.min(postElements.length, this.maxActions - this.actionCount); i++) {
            try {
                const post = postElements[i];
                const postText = post.textContent || '';

                if (!this.shouldCommentOnPost(postText, includeTerms, excludeTerms)) {
                    continue;
                }

                // Find and click comment button
                const commentButton = post.querySelector(selectors.commentButton);
                if (commentButton) {
                    await this.safeClick(commentButton);
                    await this.sleep(this.actionDelay);

                    // Find comment input
                    const commentInput = await this.waitForElement(selectors.commentInput);
                    if (commentInput) {
                        // Generate comment
                        let comment = this.generateCommentResponse();
                        if (useAi) {
                            try {
                                const ai = await this.generateAiComment(postText);
                                if (ai) comment = ai;
                            } catch (e) {
                                this.log(`AI comment failed: ${e.message}`, 'warning');
                            }
                        }

                        await this.typeText(commentInput, comment);
                        await this.sleep(this.actionDelay);

                        // Submit comment
                        const submitButton = await this.waitForElement(selectors.submitButton);
                        if (submitButton) {
                            await this.safeClick(submitButton);
                            commentedCount++;
                            this.actionCount++;
                            this.log(`Commented on post #${this.actionCount}`);
                        }

                        await this.sleep(this.commentDelay); // Delay between different comments
                    }
                }
            } catch (error) {
                this.log(`Error commenting on post: ${error.message}`, 'warning');
            }
        }

        return { success: true, commentedCount, actionCount: this.actionCount };
    }

    // Youtube-specific search -> navigate to videos -> open comments -> add comment
    async youtubeSearchAndComment({ selectors, includeTerms, excludeTerms, useAi }) {
        try {
            // Wait for results to render
            await this.sleep(this.actionDelay);

            // Find video results and collect URLs
            const videoLinks = Array.from(document.querySelectorAll('a#video-title, a.ytd-video-renderer'))
                .filter(a => a?.href && a.offsetParent !== null)
                .map(a => ({
                    url: a.href,
                    title: (a.textContent || '').trim()
                }))
                .filter(v => this.shouldCommentOnPost(v.title, includeTerms, excludeTerms))
                .slice(0, this.maxActions);

            if (videoLinks.length === 0) {
                this.log('No relevant YouTube results found', 'warning');
                return { success: true, commentedCount: 0, actionCount: this.actionCount };
            }

            this.log(`Found ${videoLinks.length} relevant videos to comment on`, 'info');

            // Save search results URL for returning
            const searchResultsUrl = window.location.href;

            // Save task state for navigation persistence
            const task = {
                action: 'searchAndComment',
                platform: this.platform,
                settings: this.settings,
                videoUrls: videoLinks.map(v => v.url),
                videoTitles: videoLinks.map(v => v.title),
                searchResultsUrl: searchResultsUrl,
                currentIndex: 0,
                actionCount: this.actionCount,
                includeTerms,
                excludeTerms,
                useAi,
                timestamp: Date.now()
            };

            await this.savePendingTask(task);

            // Start with first video
            this.log(`Starting with first video: ${videoLinks[0].title}`, 'info');
            window.location.href = videoLinks[0].url;

            return { success: true, message: 'YouTube automation started' };
        } catch (e) {
            this.log(`YouTube search/comment flow error: ${e.message}`, 'error');
            return { success: false, error: e.message };
        }
    }

    async followUsers() {
        const selectors = this.getSelectors('followUsers');
        let followedCount = 0;

        // Find follow buttons
        const followButtons = document.querySelectorAll(selectors.followButton);
        
        for (const followBtn of followButtons) {
            if (this.actionCount >= this.maxActions) break;

            try {
                // Check if already following
                const buttonText = followBtn.textContent.toLowerCase();
                if (buttonText.includes('following') || buttonText.includes('unfollow')) {
                    continue;
                }

                await this.safeClick(followBtn);
                followedCount++;
                this.actionCount++;
                this.log(`Followed user #${this.actionCount}`);

                await this.sleep(this.actionDelay);
            } catch (error) {
                this.log(`Error following user: ${error.message}`, 'warning');
            }
        }

        return { success: true, followedCount, actionCount: this.actionCount };
    }

    getSelectors(action) {
        const selectors = {
            facebook: {
                createPost: {
                    postArea: '[data-testid="post_message"] textarea, [contenteditable="true"][data-testid="post_message"], div[contenteditable="true"][aria-label*="What\'s on your mind"], textarea[placeholder*="What\'s on your mind"], div[contenteditable="true"][role="textbox"]',
                    postButton: '[data-testid="post_button"], button[data-testid="post_button"], button[type="submit"], button[aria-label*="Post"]'
                },
                respondToComments: {
                    commentSection: '[data-testid="comment"], div[data-testid="comment"], article[data-testid="comment"]',
                    replyButton: '[data-testid="comment_reply_button"], button[aria-label*="Reply"], button[data-testid="reply_button"]',
                    commentInput: '[data-testid="comment_input"] textarea, [contenteditable="true"][data-testid="comment_input"], textarea[placeholder*="Write a comment"], div[contenteditable="true"][aria-label*="Write a comment"]',
                    submitButton: '[data-testid="comment_submit_button"], button[type="submit"], button[aria-label*="Post comment"]'
                },
                searchAndComment: {
                    searchInput: '[data-testid="search_input"] input, input[placeholder*="Search"], input[aria-label*="Search"], input[name="q"]',
                    searchButton: '[data-testid="search_button"], button[type="submit"], button[aria-label*="Search"]',
                    posts: '[data-testid="post"], article[data-testid="post"], div[data-testid="post"]',
                    commentButton: '[data-testid="comment_button"], button[aria-label*="Comment"], button[data-testid="comment"]',
                    commentInput: '[data-testid="comment_input"] textarea, [contenteditable="true"][data-testid="comment_input"], textarea[placeholder*="Write a comment"]',
                    submitButton: '[data-testid="comment_submit_button"], button[type="submit"], button[aria-label*="Post comment"]'
                },
                followUsers: {
                    followButton: '[data-testid="follow_button"], button[aria-label*="Follow"], button[data-testid="follow"], button:contains("Follow")'
                }
            },
            twitter: {
                createPost: {
                    postArea: '[data-testid="tweetTextarea_0"], div[data-testid="tweetTextarea_0"], textarea[placeholder*="What\'s happening"], div[contenteditable="true"][data-testid="tweetTextarea_0"]',
                    postButton: '[data-testid="tweetButton"], button[data-testid="tweetButton"], button[aria-label*="Tweet"], button:contains("Tweet")'
                },
                respondToComments: {
                    commentSection: '[data-testid="tweet"], article[data-testid="tweet"], div[data-testid="tweet"]',
                    replyButton: '[data-testid="reply"], button[data-testid="reply"], button[aria-label*="Reply"]',
                    commentInput: '[data-testid="tweetTextarea_0"], div[data-testid="tweetTextarea_0"], textarea[placeholder*="Tweet your reply"], div[contenteditable="true"][data-testid="tweetTextarea_0"]',
                    submitButton: '[data-testid="tweetButton"], button[data-testid="tweetButton"], button[aria-label*="Tweet"], button:contains("Tweet")'
                },
                searchAndComment: {
                    searchInput: '[data-testid="SearchBox_Search_Input"], input[data-testid="SearchBox_Search_Input"], input[placeholder*="Search"], input[aria-label*="Search"]',
                    searchButton: '[data-testid="SearchBox_Search_Button"], button[data-testid="SearchBox_Search_Button"], button[aria-label*="Search"]',
                    posts: '[data-testid="tweet"], article[data-testid="tweet"], div[data-testid="tweet"]',
                    commentButton: '[data-testid="reply"], button[data-testid="reply"], button[aria-label*="Reply"]',
                    commentInput: '[data-testid="tweetTextarea_0"], div[data-testid="tweetTextarea_0"], textarea[placeholder*="Tweet your reply"]',
                    submitButton: '[data-testid="tweetButton"], button[data-testid="tweetButton"], button[aria-label*="Tweet"]'
                },
                followUsers: {
                    followButton: '[data-testid="follow"], button[data-testid="follow"], button[aria-label*="Follow"], button:contains("Follow")'
                }
            },
            instagram: {
                createPost: {
                    postArea: 'textarea[placeholder*="Write a caption"], textarea[placeholder*="What\'s on your mind"], div[contenteditable="true"][aria-label*="Write a caption"]',
                    postButton: 'button[type="submit"], button[aria-label*="Share"], button:contains("Share")'
                },
                respondToComments: {
                    commentSection: '[data-testid="comment"], div[data-testid="comment"], article[data-testid="comment"]',
                    replyButton: 'button[aria-label*="Reply"], button[data-testid="reply"], button:contains("Reply")',
                    commentInput: 'textarea[placeholder*="Add a comment"], textarea[placeholder*="Write a comment"], div[contenteditable="true"][aria-label*="Add a comment"]',
                    submitButton: 'button[type="submit"], button[aria-label*="Post"], button:contains("Post")'
                },
                searchAndComment: {
                    searchInput: 'input[placeholder*="Search"], input[aria-label*="Search"], input[name="q"], input[type="text"], div[role="textbox"], input.x1lugfcp, input._aauy',
                    searchButton: 'button[type="submit"], button[aria-label*="Search"], svg[aria-label*="Search"], div[role="button"][aria-label*="Search"]',
                    posts: '[data-testid="post"], article[data-testid="post"], div[data-testid="post"], article, div[role="article"], div._ac7v',
                    commentButton: 'button[aria-label*="Comment"], svg[aria-label*="Comment"], div[role="button"][aria-label*="Comment"], button._abl-',
                    commentInput: 'textarea[placeholder*="Add a comment"], textarea[placeholder*="Write a comment"], textarea[aria-label*="Add a comment"], form textarea, textarea._ablz',
                    submitButton: 'button[type="submit"], button[aria-label*="Post"], div[role="button"]:contains("Post"), button._acan'
                },
                followUsers: {
                    followButton: 'button[aria-label*="Follow"], button[data-testid="follow"], button:contains("Follow")'
                }
            },

            youtube: {
                createPost: {
                    postArea: '#contenteditable-root, div[contenteditable="true"][aria-label*="Add a message"], textarea[placeholder*="Add a message"]',
                    postButton: '#submit-button, button[aria-label*="Post"], button:contains("Post")'
                },
                respondToComments: {
                    commentSection: '#comment, div[data-testid="comment"], article[data-testid="comment"]',
                    replyButton: '#reply-button, button[aria-label*="Reply"], button[data-testid="reply"]',
                    commentInput: '#contenteditable-root, div[contenteditable="true"][aria-label*="Add a comment"], textarea[placeholder*="Add a comment"]',
                    submitButton: '#submit-button, button[aria-label*="Post"], button:contains("Post")'
                },
                searchAndComment: {
                    searchInput: '#search-input input, input[placeholder*="Search"], input[aria-label*="Search"]',
                    searchButton: '#search-button, button[aria-label*="Search"]',
                    posts: '#video-title, div[data-testid="video"], article[data-testid="video"]',
                    commentButton: '#reply-button, button[aria-label*="Comment"], button[data-testid="comment"]',
                    commentInput: '#contenteditable-root, div[contenteditable="true"][aria-label*="Add a comment"]',
                    submitButton: '#submit-button, button[aria-label*="Post"], button:contains("Post")'
                },
                followUsers: {
                    followButton: '#subscribe-button, button[aria-label*="Subscribe"], button:contains("Subscribe")'
                }
            }
        };

        return selectors[this.platform]?.[action] || {};
    }

    generatePostContent() {
        const templates = [
            "Just had an amazing day! 🌟 What's everyone up to?",
            "Can't believe how fast time flies! ⏰ What's your favorite way to spend the weekend?",
            "Working on some exciting projects! 💼 Anyone else feeling productive today?",
            "Beautiful weather today! ☀️ Perfect for a walk in the park.",
            "Learning something new every day! 📚 What's the last thing you learned?",
            "Grateful for all the amazing people in my life! ❤️ Who are you thankful for today?",
            "Sometimes you need to take a step back to move forward! 🚀 What's your biggest challenge right now?",
            "Coffee and productivity - the perfect combination! ☕ What's your go-to productivity hack?"
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }

    generateCommentResponse() {
        const responses = [
            "Great post! 👍",
            "Thanks for sharing! 🙏",
            "Love this! ❤️",
            "Amazing! 🔥",
            "So true! 💯",
            "Thanks for the insight! 💡",
            "This is awesome! 🌟",
            "Couldn't agree more! 👏",
            "Well said! 🎯",
            "Thanks for posting this! 📝"
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    generateSearchTerm() {
        const searchTerms = [
            "motivation",
            "inspiration",
            "success",
            "happiness",
            "productivity",
            "mindfulness",
            "leadership",
            "innovation",
            "creativity",
            "growth"
        ];
        return searchTerms[Math.floor(Math.random() * searchTerms.length)];
    }

    shouldCommentOnPost(postText, includeTermsCsv, excludeTermsCsv) {
        const text = (postText || '').toLowerCase();
        const includes = (includeTermsCsv || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const excludes = (excludeTermsCsv || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        if (includes.length > 0) {
            const hasInclude = includes.some(term => text.includes(term));
            if (!hasInclude) return false;
        }
        if (excludes.length > 0) {
            const hasExclude = excludes.some(term => text.includes(term));
            if (hasExclude) return false;
        }
        return true;
    }

    async generateAiComment(postText) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'ai.generateComment',
                postText,
                context: `platform=${this.platform}`,
                style: this.settings?.commentStyle || 'concise, friendly'
            }, (response) => {
                if (!response) {
                    reject(new Error('No response from background'));
                    return;
                }
                if (response.success) {
                    resolve(response.text);
                } else {
                    reject(new Error(response.error || 'AI error'));
                }
            });
        });
    }

    async waitForElement(selector, timeout = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) {
                this.log(`Found element: ${selector}`, 'success');
                return element;
            }
            await this.sleep(0.1);
        }
        
        this.log(`Element not found after ${timeout}ms: ${selector}`, 'error');
        
        // Try to find similar elements for debugging
        const similarElements = this.findSimilarElements(selector);
        if (similarElements.length > 0) {
            this.log(`Found ${similarElements.length} similar elements:`, 'warning');
            similarElements.forEach((el, index) => {
                this.log(`  ${index + 1}. ${el.tagName} - ${el.className} - ${el.getAttribute('data-testid') || 'no-testid'}`, 'warning');
            });
        }
        
        return null;
    }

    findSimilarElements(selector) {
        // Try to find elements that might be similar to what we're looking for
        const possibleSelectors = [
            'textarea',
            'input',
            'button',
            '[contenteditable="true"]',
            '[data-testid]',
            '[aria-label]',
            '[placeholder]'
        ];
        
        const elements = [];
        possibleSelectors.forEach(sel => {
            const found = document.querySelectorAll(sel);
            found.forEach(el => {
                if (el.offsetParent !== null) { // Only visible elements
                    elements.push(el);
                }
            });
        });
        
        return elements.slice(0, 10); // Return first 10 elements
    }

    async safeClick(element) {
        if (!element) return;
        
        try {
            element.click();
        } catch (error) {
            // Fallback to programmatic click
            element.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        }
    }

    async typeText(element, text) {
        if (!element) return;
        
        try {
            // Clear existing text
            element.value = '';
            element.textContent = '';
            
            // Focus the element
            element.focus();
            
            // Type the text character by character for natural behavior
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                
                if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                    element.value += char;
                } else {
                    element.textContent += char;
                }
                
                // Trigger input event
                element.dispatchEvent(new Event('input', { bubbles: true }));
                
                // Small delay between characters (50ms)
                await this.sleep(0.05);
            }
            
            // Trigger change event
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (error) {
            this.log(`Error typing text: ${error.message}`, 'warning');
        }
    }

    sleep(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] [${this.platform.toUpperCase()}] ${message}`;
        
        console.log(logMessage);
        
        // Send to popup if available
        try {
            chrome.runtime.sendMessage({
                type: 'log',
                message: logMessage,
                logType: type
            });
        } catch (error) {
            // Popup might not be open
        }
    }

    debugPage() {
        this.log('=== DEBUG MODE ===', 'info');
        this.log(`Current URL: ${window.location.href}`, 'info');
        this.log(`Detected Platform: ${this.platform}`, 'info');
        
        // Find all interactive elements
        const interactiveElements = [
            'textarea',
            'input',
            'button',
            '[contenteditable="true"]',
            '[data-testid]',
            '[aria-label]',
            '[role="button"]',
            '[role="textbox"]'
        ];
        
        interactiveElements.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                this.log(`Found ${elements.length} elements with selector: ${selector}`, 'info');
                elements.forEach((el, index) => {
                    if (index < 5) { // Only show first 5
                        const text = el.textContent?.substring(0, 50) || '';
                        const testid = el.getAttribute('data-testid') || '';
                        const ariaLabel = el.getAttribute('aria-label') || '';
                        const placeholder = el.getAttribute('placeholder') || '';
                        
                        this.log(`  ${index + 1}. ${el.tagName} - testid:"${testid}" aria-label:"${ariaLabel}" placeholder:"${placeholder}" text:"${text}"`, 'info');
                    }
                });
            }
        });
        
        this.log('=== END DEBUG ===', 'info');
    }

    async checkForPendingTask() {
        try {
            const result = await chrome.storage.local.get(['pendingTask']);
            if (result.pendingTask && result.pendingTask.platform === this.platform) {
                // Add a delay to prevent immediate execution on page load
                setTimeout(async () => {
                    // Double-check the task is still valid and not too old
                    const recheck = await chrome.storage.local.get(['pendingTask']);
                    if (recheck.pendingTask && 
                        recheck.pendingTask.platform === this.platform &&
                        Date.now() - (recheck.pendingTask.timestamp || 0) < 300000) { // 5 minutes max
                        this.log('Resuming pending task...', 'info');
                        await this.resumeTask(recheck.pendingTask);
                    } else {
                        this.log('Clearing stale pending task', 'info');
                        await this.clearPendingTask();
                    }
                }, 2000); // 2 second delay
            }
        } catch (error) {
            this.log(`Error checking pending task: ${error.message}`, 'warning');
        }
    }

    async resumeTask(task) {
        this.settings = task.settings;
        this.commentDelay = this.settings.delay || 2; // seconds between comments
        this.actionDelay = 0.5; // seconds for UI interactions
        this.maxActions = this.settings.maxActions || 10;
        this.actionCount = task.actionCount || 0;

        if (task.action === 'searchAndComment') {
            await this.continueYouTubeComments(task);
        }
    }

    // Youtube-specific search -> navigate to videos -> open comments -> add comment
    async youtubeSearchAndComment({ selectors, includeTerms, excludeTerms, useAi }) {
        try {
            // Wait for results to render
            await this.sleep(this.actionDelay);

            // Save search results URL for returning
            const searchResultsUrl = window.location.href;

            // Save task state for navigation persistence - don't pre-collect URLs
            const task = {
                action: 'searchAndComment',
                platform: this.platform,
                settings: this.settings,
                searchResultsUrl: searchResultsUrl,
                actionCount: this.actionCount,
                includeTerms,
                excludeTerms,
                useAi,
                timestamp: Date.now(),
                mode: 'find_next_video',
                processedVideoIds: [] // Track which videos we've already commented on
            };

            await this.savePendingTask(task);

            // Find and navigate to first video
            const firstVideo = await this.findNextYouTubeVideo(task);
            if (firstVideo) {
                this.log(`Starting with video: ${firstVideo.title}`, 'info');
                window.location.href = firstVideo.url;
            } else {
                this.log('No relevant videos found', 'warning');
                await this.clearPendingTask();
            }

            return { success: true, message: 'YouTube automation started' };
        } catch (e) {
            this.log(`YouTube search/comment flow error: ${e.message}`, 'error');
            return { success: false, error: e.message };
        }
    }

    async findNextYouTubeVideo(task) {
        const { includeTerms, excludeTerms, processedVideoIds = [] } = task;
        
        // Scroll to load more videos if needed
        window.scrollTo(0, document.body.scrollHeight);
        await this.sleep(1);
        
        // Find all current video links
        const videoLinks = Array.from(document.querySelectorAll('a#video-title, a.ytd-video-renderer'))
            .filter(a => a?.href && a.offsetParent !== null)
            .map(a => ({
                url: a.href,
                title: (a.textContent || '').trim(),
                videoId: a.href.split('v=')[1]?.split('&')[0],
                channel: a.closest('ytd-video-renderer')?.querySelector('#channel-name, #text')?.textContent?.trim() || 'Unknown'
            }))
            .filter(v => {
                // Filter by include/exclude terms
                if (!this.shouldCommentOnPost(v.title, includeTerms, excludeTerms)) return false;
                // Skip already processed videos
                if (processedVideoIds.includes(v.videoId)) return false;
                return true;
            });

        if (videoLinks.length === 0) {
            this.log('No more unprocessed videos found', 'warning');
            return null;
        }

        // Return the first unprocessed video
        return videoLinks[0];
    }

    // Youtube-specific search -> navigate to videos -> open comments -> add comment
    async youtubeSearchAndComment({ selectors, includeTerms, excludeTerms, useAi }) {
        try {
            // Wait for results to render
            await this.sleep(this.actionDelay);

            // Save search results URL for returning
            const searchResultsUrl = window.location.href;

            // Save task state for navigation persistence - don't pre-collect URLs
            const task = {
                action: 'searchAndComment',
                platform: this.platform,
                settings: this.settings,
                searchResultsUrl: searchResultsUrl,
                actionCount: this.actionCount,
                includeTerms,
                excludeTerms,
                useAi,
                timestamp: Date.now(),
                mode: 'find_next_video',
                processedVideoIds: [], // Track which videos we've already commented on
                processedChannels: [], // Track which channels we've already commented on
                scrollPosition: 0 // Track how far we've scrolled through results
            };

            await this.savePendingTask(task);

            // Find and navigate to first video
            const firstVideo = await this.findNextYouTubeVideo(task);
            if (firstVideo) {
                this.log(`Starting with video: ${firstVideo.title} from ${firstVideo.channel}`, 'info');
                window.location.href = firstVideo.url;
            } else {
                this.log('No relevant videos found', 'warning');
                await this.clearPendingTask();
            }

            return { success: true, message: 'YouTube automation started' };
        } catch (e) {
            this.log(`YouTube search/comment flow error: ${e.message}`, 'error');
            return { success: false, error: e.message };
        }
    }

    async findNextYouTubeVideo(task) {
        const { includeTerms, excludeTerms, processedVideoIds = [], processedChannels = [], scrollPosition = 0 } = task;
        
        this.log(`Looking for videos... Already processed videos: [${processedVideoIds.join(', ')}]`, 'info');
        this.log(`Already processed channels: [${processedChannels.join(', ')}]`, 'info');
        this.log(`Current URL: ${window.location.href}`, 'info');
        
        // Scroll to load more videos
        window.scrollTo(0, Math.max(scrollPosition, 0));
        await this.sleep(1);
        
        // Find all current video links with better selectors
        const videoElements = Array.from(document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer'));
        this.log(`Found ${videoElements.length} video elements on page`, 'info');
        
        const videoLinks = videoElements
            .map(videoEl => {
                const linkEl = videoEl.querySelector('a#video-title, a#thumbnail, h3 a');
                if (!linkEl?.href) return null;
                
                const titleEl = videoEl.querySelector('#video-title, h3 a, .title');
                const channelEl = videoEl.querySelector('#channel-name a, #text a, .channel-name a, ytd-channel-name a, #metadata #channel-name a');
                
                // Get channel name with multiple fallbacks
                let channelName = channelEl?.textContent?.trim();
                
                // If channel name is still unknown, try to get it from video metadata
                if (!channelName || channelName === 'Unknown Channel') {
                    const metadataEl = videoEl.querySelector('ytd-video-meta-block #metadata #byline a, .ytd-video-meta-block #byline a');
                    channelName = metadataEl?.textContent?.trim() || 'Unknown Channel';
                }
                
                return {
                    url: linkEl.href,
                    title: titleEl?.textContent?.trim() || 'Unknown Title',
                    videoId: linkEl.href.split('v=')[1]?.split('&')[0],
                    channel: channelName,
                    element: videoEl
                };
            })
            .filter(v => v && v.videoId) // Remove null entries and ensure videoId exists
            .filter(v => {
                // Filter by include/exclude terms
                if (!this.shouldCommentOnPost(v.title, includeTerms, excludeTerms)) {
                    this.log(`Skipping "${v.title}" - doesn't match search terms`, 'info');
                    return false;
                }
                // Skip already processed videos
                if (processedVideoIds.includes(v.videoId)) {
                    this.log(`Skipping "${v.title}" - video already processed`, 'info');
                    return false;
                }
                // CRITICAL: Skip already processed channels
                if (processedChannels.includes(v.channel)) {
                    this.log(`Skipping "${v.title}" - channel "${v.channel}" already processed`, 'info');
                    return false;
                }
                return true;
            });

        this.log(`Found ${videoLinks.length} unprocessed, relevant videos`, 'info');
        
        // Debug: Show first few videos found
        if (videoLinks.length > 0) {
            const debugList = videoLinks.slice(0, 3).map(v => `"${v.title}" (${v.videoId}) by ${v.channel}`).join(', ');
            this.log(`Available videos: ${debugList}${videoLinks.length > 3 ? '...' : ''}`, 'info');
        }

        if (videoLinks.length === 0) {
            // Try scrolling more to load additional videos
            const currentScroll = window.pageYOffset;
            const maxScroll = document.body.scrollHeight - window.innerHeight;
            
            if (currentScroll < maxScroll) {
                this.log('No videos found, scrolling to load more...', 'info');
                window.scrollTo(0, currentScroll + 1000);
                await this.sleep(2);
                return await this.findNextYouTubeVideo({ ...task, scrollPosition: currentScroll + 1000 });
            } else {
                this.log('Reached end of search results, no more videos available', 'warning');
                return null;
            }
        }

        // Return the first unprocessed video
        const selectedVideo = videoLinks[0];
        this.log(`Selected video: "${selectedVideo.title}" from "${selectedVideo.channel}"`, 'success');
        return selectedVideo;
    }

    async continueYouTubeComments(task) {
        const { includeTerms, excludeTerms, useAi, searchResultsUrl, processedVideoIds = [], processedChannels = [] } = task;
        
        if (this.actionCount >= this.maxActions) {
            await this.clearPendingTask();
            this.log('YouTube automation completed - max actions reached', 'success');
            return;
        }

        const currentVideoUrl = window.location.href;

        // If we're on search results, find the next video to comment on
        if (currentVideoUrl.includes('/results?') || currentVideoUrl.includes('search_query=')) {
            this.log('On search results, finding next video...', 'info');
            
            const nextVideo = await this.findNextYouTubeVideo(task);
            if (nextVideo) {
                // DON'T mark as processed yet - only after successful comment
                this.log(`Found new video: ${nextVideo.title} from ${nextVideo.channel}`, 'info');
                window.location.href = nextVideo.url;
            } else {
                await this.clearPendingTask();
                this.log('No more videos to process', 'success');
            }
            return;
        }

        // If we're on a video page, try to comment
        if (currentVideoUrl.includes('/watch?v=')) {
            const currentVideoId = currentVideoUrl.split('v=')[1]?.split('&')[0];
            this.log(`On video page: ${currentVideoId}`, 'info');
            
            // Check if we've already processed this video
            if (processedVideoIds.includes(currentVideoId)) {
                this.log('Already commented on this video, returning to search...', 'warning');
                window.location.href = searchResultsUrl;
                return;
            }
            
            this.log('On video page, attempting to comment...', 'info');
            
            try {
                // Wait for page to fully load
                await this.sleep(this.actionDelay * 2); // Wait for page load

                // Get video title
                const titleElement = await this.waitForElement('h1.ytd-video-primary-info-renderer, h1.title, h1[class*="title"]', 5000);
                const videoTitle = titleElement ? titleElement.textContent.trim() : 'this video';
                
                // Scroll to comments
                const commentsSection = await this.waitForElement('#comments', 8000);
                if (!commentsSection) {
                    this.log('Comments section not found, returning to search...', 'warning');
                    window.location.href = searchResultsUrl;
                    return;
                }

                commentsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.sleep(this.actionDelay);

                // Try to click comment area
                const commentSelectors = [
                    '#placeholder-area',
                    '#simplebox-placeholder', 
                    'div[id="placeholder-area"]',
                    'paper-textarea[placeholder*="Add a comment"]'
                ];
                
                let commentBox = null;
                for (const sel of commentSelectors) {
                    commentBox = await this.waitForElement(sel, 2000);
                    if (commentBox) break;
                }

                if (!commentBox) {
                    this.log('Comment box not found, returning to search...', 'warning');
                    window.location.href = searchResultsUrl;
                    return;
                }

                await this.safeClick(commentBox);
                await this.sleep(this.actionDelay);

                // Find input
                const inputSelectors = [
                    '#contenteditable-root',
                    'div[contenteditable="true"]',
                    'textarea[aria-label*="comment"]'
                ];
                
                let input = null;
                for (const sel of inputSelectors) {
                    input = await this.waitForElement(sel, 2000);
                    if (input) break;
                }

                if (!input) {
                    this.log('Comment input not found, returning to search...', 'warning');
                    window.location.href = searchResultsUrl;
                    return;
                }

                // Generate comment
                let comment = this.generateCommentResponse();
                if (useAi) {
                    try {
                        const ai = await this.generateAiComment(`Video: "${videoTitle}"`);
                        if (ai) comment = ai;
                    } catch (e) {
                        this.log(`AI comment failed: ${e.message}`, 'warning');
                    }
                }

                await this.typeText(input, comment);
                await this.sleep(this.actionDelay);

                // Submit
                const submitSelectors = [
                    '#submit-button',
                    'button[aria-label*="Comment"]',
                    'button[id*="submit"]'
                ];
                
                let submitButton = null;
                for (const sel of submitSelectors) {
                    submitButton = await this.waitForElement(sel, 2000);
                    if (submitButton && !submitButton.disabled) break;
                }

                if (submitButton && !submitButton.disabled) {
                    await this.safeClick(submitButton);
                    this.actionCount++;
                    
                    // Get channel name from current video page
                    const channelElement = await this.waitForElement('#channel-name a, ytd-channel-name a, .ytd-channel-name a', 2000);
                    const channelName = channelElement ? channelElement.textContent.trim() : 'Unknown Channel';
                    
                    this.log(`✅ Commented on: "${videoTitle}" from "${channelName}" (${this.actionCount}/${this.maxActions})`, 'success');
                    
                    // IMPORTANT: Update the task with this video AND channel marked as processed
                    const updatedTask = {
                        ...task,
                        processedVideoIds: [...processedVideoIds, currentVideoId],
                        processedChannels: [...processedChannels, channelName],
                        actionCount: this.actionCount
                    };
                    await this.savePendingTask(updatedTask);
                    
                } else {
                    this.log('Submit button not available', 'warning');
                }

            } catch (error) {
                this.log(`Error commenting: ${error.message}`, 'warning');
            }

            // Return to search results to find next video
            this.log('Returning to search results to find next video...', 'info');
            setTimeout(() => {
                window.location.href = searchResultsUrl;
            }, this.commentDelay * 1000); // Convert back to ms for setTimeout
            return;
        }

        // If we're on a channel page, go back to search results
        if (currentVideoUrl.includes('/@') || currentVideoUrl.includes('/channel/') || currentVideoUrl.includes('/c/')) {
            this.log('On channel page instead of video, returning to search results...', 'warning');
            window.location.href = searchResultsUrl;
            return;
        }

        // If we're somewhere else, go back to search results
        this.log('Not on expected page, returning to search results...', 'warning');
        window.location.href = searchResultsUrl;
    }

    async savePendingTask(task) {
        await chrome.storage.local.set({ pendingTask: task });
    }

    async clearPendingTask() {
        await chrome.storage.local.remove(['pendingTask']);
    }

    async stopAutomation() {
        await this.clearPendingTask();
        this.isRunning = false;
        this.log('Automation stopped by user', 'info');
    }
}

// Initialize the automation engine
new SocialMediaAutomationEngine();
