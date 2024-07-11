// ==UserScript==
// @name         Wayfarer Skip Counter
// @version      0.0.2
// @description  Count your skip usage in the last 24 hours
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-skip-count.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// ==/UserScript==

/* eslint-env es6 */
/* eslint no-var: "error" */

function init() {
    const LOOKBACK_TIME = 24 * 60 * 60;
    let skip_count = [];

    console.log("Wayfarer Skip Counter init");
    addCss();

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/review') {
                if (method == 'GET') {
                    this.addEventListener('load', injectCounter, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    // Overwrite the send method of the XMLHttpRequest.prototype to intercept POST data
    (function (send) {
        XMLHttpRequest.prototype.send = function(dataText) {
            try {
                const data = JSON.parse(dataText);
                const xhr = this;
                this.addEventListener('load', handleXHRResult(function(result) {
                    if (xhr.responseURL == window.origin + '/api/v1/vault/review/skip') {
                        handleSkip(data, result).catch(console.error);
                    }
                }), false);
            } catch (err) { }
            send.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.send);

    // Perform validation on result to ensure the request was successful before it's processed further.
    // If validation passes, passes the result to callback function.
    const handleXHRResult = callback => function(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            if (!json.result) return;
            callback(json.result, e);
        } catch (err) {
            console.error(`No json data found in response (probably nothing to worry about)\n${err}`);
        }
    };

    function injectCounter(e) {
        const ref = document.querySelector('wf-logo');
        if (!ref) {
            setTimeout(injectCounter, 200);
            return;
        }

        const div = document.createElement('div');
        

        let countLabel = document.createElement('p');
        countLabel.textContent = 'Skip Count: ';
        let counter = document.createElement('p');
        const userId = getUserId();
        let skip_count = JSON.parse(localStorage.getItem(`wfsc_skip_count_${userId}`));
        if (skip_count === undefined || skip_count === null || skip_count === ""){
            skip_count = [];
        }
        counter.textContent = `${skip_count.length}`;
        div.appendChild(countLabel);
        div.appendChild(counter);

        let className;
        if (skip_count.length < 10) {
            className = 'wayfarerrsc';
        } else if (skip_count.length < 25) {
            className = 'wayfarerrsc_low';
        } else if (skip_count.length < 45) {
            className = 'wayfarerrsc_mid';
        } else if (skip_count.length < 65) {
            className = 'wayfarerrsc_med';
        } else if (skip_count.length < 85) {
            className = 'wayfarerrsc_high';
            localStorage.setItem(`wfsc_notify_${userId}`, JSON.stringify(true));
        } else {
            className = 'wayfarerrsc_extreme';
        }
        div.className = className;

        if (skip_count.length >= 99) {
            let notify = JSON.parse(localStorage.getItem(`wfsc_notify_${userId}`));
            if (notify === undefined || notify === null || notify === ""){
                notify = true;
            }
            if (notify) {
                alert(`Careful using skips! Currently at ${skip_count.length} skips!`);
                localStorage.setItem(`wfsc_notify_${userId}`, JSON.stringify(false));
            }
        }

        const container = ref.parentNode.parentNode;
        container.appendChild(div);
    }

    const handleSkip = (review, response) => new Promise((resolve, reject) => {
        const userId = getUserId();
        if (review && (response || response === 'api.review.post.accepted')) {
            let skip_count = JSON.parse(localStorage.getItem(`wfsc_skip_count_${userId}`));
            if (skip_count === undefined || skip_count === null || skip_count === ""){
                skip_count = [];
            }
            const seconds = Math.round(new Date().getTime() / 1000);
            skip_count.push(seconds);
            while (true) {
                let oldest = parseInt(skip_count[0]);
                const now = Math.round(new Date().getTime() / 1000);
                console.log(`comparing now: ${now} against oldest: ${oldest}`);
                if (now - oldest > LOOKBACK_TIME) {
                    console.log("Skip Count: removing oldest");
                    skip_count = skip_count.slice(1);
                } else {
                    console.log("Skip Count: completed comparison: oldest in range");
                    break;
                }
                if (skip_count.size <= 1) {
                    console.log("Skip Count: completed comparison: none left to check");
                    localStorage.setItem(`wfsc_notify_${userId}`, JSON.stringify(true));
                    break;
                }
            }
            localStorage.setItem(`wfsc_skip_count_${userId}`, JSON.stringify(skip_count));
        }
    });

    function getUserId() {
        var els = document.getElementsByTagName("image");
        for (var i = 0; i < els.length; i++) {
           const element = els[i];
           const attribute = element.getAttribute("href");
           let fields = attribute.split('/');
           let userId = fields[fields.length-1];
           fields = userId.split('=');
           userId = fields[0];
           return userId;
        }
        return "temporary_default_userid";
    }

    const awaitElement = get => new Promise((resolve, reject) => {
        let triesLeft = 10;
        const queryLoop = () => {
            const ref = get();
            if (ref) resolve(ref);
            else if (!triesLeft) reject();
            else setTimeout(queryLoop, 100);
            triesLeft--;
        }
        queryLoop();
    });

    function addCss() {
        const css = `
              .wayfarerrsc, .wayfarerrsc_low, .wayfarerrsc_mid, .wayfarerrsc_med, .wayfarerrsc_high, .wayfarerrsc_extreme {
                  color: #333;
                  margin-left: 2em;
                  padding-top: 0.3em;
                  text-align: center;
                  display: block;
              }

              .dark .wayfarerrsc, .wayfarerrsc_low, .wayfarerrsc_mid, .wayfarerrsc_med, .wayfarerrsc_high, .wayfarerrsc_extreme {
                  color: #ddd;
              }

              .wayfarerrsc p:nth-child(2) {
                  font-size: 20px;
                  color: #20B8E3;
              }

              .wayfarerrsc_low p:nth-child(2) {
                  font-size: 20px;
                  color: #44ce1b;
              }
              .wayfarerrsc_mid p:nth-child(2) {
                  font-size: 20px;
                  color: #bbdb44;
              }
              .wayfarerrsc_med p:nth-child(2) {
                  font-size: 20px;
                  color: #f7e379;
              }
              .wayfarerrsc_high p:nth-child(2) {
                  font-size: 20px;
                  color: #f2a134;
              }
              .wayfarerrsc_extreme p:nth-child(2) {
                  font-size: 20px;
                  color: #e51f1f;
              }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }
}

init();
