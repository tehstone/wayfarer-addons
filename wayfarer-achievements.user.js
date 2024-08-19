// ==UserScript==
// @name         Wayfarer Achievements
// @version      0.0.1
// @description  Adds some fun achievements you can earn in Wayfarer
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-achievements.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// ==/UserScript==

// Copyright 2024 tehstone
// This file is part of the Wayfarer Addons collection.

// This script is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This script is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You can find a copy of the GNU General Public License in the root
// directory of this script's GitHub repository:
// <https://github.com/tehstone/wayfarer-addons/blob/main/LICENSE>
// If not, see <https://www.gnu.org/licenses/>.

/* eslint-env es6 */
/* eslint no-var: "error" */

(() => {
    let userHash = 0;
    let stats;
    let nominations;
    const all_achievements = [
        {
            "id": 0,
            "title": "Reviewer",
            "description": "Completed {0} reviews.",
            "image": "https://tehstone.github.io/wayfarer-addons/images/reviews.png",
            "tiers": [1000, 5000, 10000, 25000]
        },
        {
            "id": 1,
            "title": "tbd",
            "description": `Earned {0} agreements`,
            "image": "https://tehstone.github.io/wayfarer-addons/images/agreements.png",
            "tiers": [250, 1000, 2500, 5000]
        },
        {
            "id": 2,
            "title": "Nominator",
            "description": `Nominated {0} wayspots.`,
            "image": "https://tehstone.github.io/wayfarer-addons/images/nominations.png",
            "tiers": [25, 100, 250, 1000]
        },
        {
            "id": 3,
            "title": "Creator",
            "description": `Created {0} wayspots`,
            "image": "https://tehstone.github.io/wayfarer-addons/images/nominations.png",
            "tiers": [10, 50, 100, 500]
        }
    ];

    // https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
    const cyrb53 = function(str, seed = 0) {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
        h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1>>>0);
    };

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/profile' && method == 'GET') {
                this.addEventListener('load', parseStats, false);
            } else if (url == '/api/v1/vault/properties' && method == 'GET') {
                // NOTE: Requires @run-at document-start.
                this.addEventListener('load', handleXHRResult(handleProfile), false);
            } else if (url == '/api/v1/vault/manage') {
                if (method == 'GET') {
                    this.addEventListener('load', parseNominations, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

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
            console.error(err);
        }
    };

    // Get a user ID to properly handle browsers shared between several users. Store a hash only, for privacy.
    const handleProfile = ({ socialProfile }) => {
        if (socialProfile.email) userHash = cyrb53(socialProfile.email);
    };

    function parseStats(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.warn('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha)
                return;

            stats = json.result;
            if (!stats) {
                console.warn('Wayfarer\'s response didn\'t include a candidate.');
                return;
            }
            awaitElement(() => document.querySelector('wf-rating-bar'))
            .then((ref) => {
                checkProfileAchievementStatus();
                addAchievements();
            });

        } catch (e)    {
            console.warn(e); // eslint-disable-line no-console
        }
    }

    function parseNominations(e) {
        console.log("parsing nom nom noms")
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.log('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha)
                return;

            nominations = json.result.submissions;
            if (!nominations) {
                console.log('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            setTimeout(() => {
                checkContributionAchievementStatus();
            }, 300);
            

        } catch (e)    {
            console.log(e); // eslint-disable-line no-console
        }
    }

    function addAchievements() {
        //awaitElementList(() => document.getElementsByTagName("wf-profile-stats"))
        awaitElement(() => document.querySelector('wf-rating-bar')).then(ref => {
            //.then((ref) => {
                //const profileStats = ref[0];
                let achievementsContainer = document.createElement('div');
                achievementsContainer.classList.add("achievement_container");
                const earnedAchievements = localStorage.hasOwnProperty(`wfAchievements_${userHash}`) ? JSON.parse(localStorage[`wfAchievements_${userHash}`]) : {};
                earnedAchievements.forEach(k => achievementsContainer.appendChild(renderAchievement(k))); 
                // achievementsContainer.appendChild(renderAchievement({
                //     "id": 0,
                //     "count": 12321
                // }));
                // achievementsContainer.appendChild(renderAchievement({
                //     "id": 1,
                //     "count": 1250
                // }));
                // achievementsContainer.appendChild(renderAchievement({
                //     "id": 2,
                //     "count": 57
                // }));
                let achievementsHeader = document.createElement('div');
                achievementsHeader.innerHTML = "<br>Achievements!";
                achievementsHeader.classList.add("text-2xl");
                ref.parentNode.appendChild(achievementsHeader);
                ref.parentNode.appendChild(achievementsContainer);
            });
    }

    function renderAchievement(achievement) {
        const achievementDef = all_achievements.filter(obj => {
          return obj.id === achievement.id;
        })[0];
        const count = achievement["count"];

        let achievementDiv = document.createElement('div');
        achievementDiv.classList.add("achievement_box");
        let achImg = document.createElement("img");
        let imgBox = document.createElement("div");
        imgBox.classList.add("achievement_img");
        imgBox.appendChild(achImg);
        achievementDiv.appendChild(imgBox);
        let expBox = document.createElement("div");
        expBox.classList.add("achievement_exp");
        let textBox = document.createElement("div");
        textBox.classList.add("achievement_text");
        expBox.appendChild(textBox);
        let tierBox = document.createElement("div");
        tierBox.classList.add("achievement_tier");
        expBox.appendChild(tierBox);

        achImg.src = achievementDef["image"];
        textBox.innerHTML = achievementDef["description"].replace('{0}', count);
        for (j=0; j < 4; j++) {
            const tierInd = document.createElement("div");
            tierInd.classList.add("achievement_ind_tier");
            const tierImg = document.createElement("img");
            if (count >= parseInt(achievementDef["tiers"][j])) {
                tierImg.src = "https://tehstone.github.io/wayfarer-addons/images/tier-orange.png";    
            } else {
                tierImg.src = "https://tehstone.github.io/wayfarer-addons/images/tier-grey.png";
            }
            tierInd.title = achievementDef["tiers"][j];
            
            tierInd.appendChild(tierImg);
            tierBox.appendChild(tierInd);
        }
        achievementDiv.appendChild(expBox);

        return achievementDiv;
    }

    function checkProfileAchievementStatus() {
        if (userHash == 0) {
            console.log("userHash has not been set, achievement status will not be checked until properties is loaded.");
            return;
        }
        const earnedAchievements = localStorage.hasOwnProperty(`wfAchievements_${userHash}`) ? JSON.parse(localStorage[`wfAchievements_${userHash}`]) : [];
        const {accepted, rejected, duplicated, finished, available, progress} = stats;

        let reviewAchEarned;
        let agreeAchEarned;

        if (earnedAchievements.length > 0) { 
            reviewAchEarned = earnedAchievements.filter(obj => {
              return obj.id === 0;
            })[0];
            agreeAchEarned = earnedAchievements.filter(obj => {
              return obj.id === 1;
            })[0];
        }

        if (reviewAchEarned == null) {
            reviewAchEarned = {
                "id": 0,
                "count": 0
            }
            earnedAchievements.push(reviewAchEarned);
        }
        reviewAchEarned["count"] = finished;

        if (agreeAchEarned == null) {
            agreeAchEarned = {
                "id": 1,
                "count": 0
            }
            earnedAchievements.push(agreeAchEarned);
        }
        agreeAchEarned["count"] = accepted + rejected + duplicated;

        localStorage[`wfAchievements_${userHash}`] = JSON.stringify(earnedAchievements);
    }

    function checkContributionAchievementStatus() {
        if (userHash == 0) {
            console.log("userHash has not been set, achievement status will not be checked until properties is loaded.");
            return;
        }
        awaitElement(() => document.querySelector('app-submissions-list'))
            .then((ref) => {
                const earnedAchievements = localStorage.hasOwnProperty(`wfAchievements_${userHash}`) ? JSON.parse(localStorage[`wfAchievements_${userHash}`]) : [];
                const countsByTypeAndStatus = {
                    "NOMINATION": {},
                    "EDIT": {},
                    "EDIT_LOCATION": {},
                    "EDIT_DESCRIPTION": {},
                    "EDIT_TITLE": {},
                    "PHOTO": {},
                    "TOTAL": {},
                };

                for (let i = 0; i < nominations.length; i++) {
                    const { type, status, upgraded } = nominations[i];

                    if (!countsByTypeAndStatus[type]) {
                        countsByTypeAndStatus[type] = {};
                    }
                    if (!countsByTypeAndStatus[type][status]) {
                        countsByTypeAndStatus[type][status] = 0;
                    }

                    countsByTypeAndStatus[type][status]++;
                    if (status === "NOMINATED" && upgraded) {
                        countsByTypeAndStatus[type]["NOMINATED_UPGRADED"] = (countsByTypeAndStatus[type]["NOMINATED_UPGRADED"] || 0) + 1;
                    } else if (status === "VOTING" && upgraded) {
                        countsByTypeAndStatus[type]["VOTING_UPGRADED"] = (countsByTypeAndStatus[type]["VOTING_UPGRADED"] || 0) + 1;
                    }

                    if (["ACCEPTED", "REJECTED", "DUPLICATE"].includes(status)) {
                        countsByTypeAndStatus[type]["DECIDED"] = (countsByTypeAndStatus[type]["DECIDED"] || 0) + 1;
                    }
                    if (["ACCEPTED", "REJECTED", "DUPLICATE", "VOTING", "NOMINATED", "NIANTIC_REVIEW", "APPEALED", "WITHDRAWN", "HELD"].includes(status)) {
                        countsByTypeAndStatus[type]["SUBMITTED"] = (countsByTypeAndStatus[type]["SUBMITTED"] || 0) + 1;
                    }

                }

                let nomAchEarned;
                let createAchEarned;

                if (earnedAchievements.length > 0) { 
                    nomAchEarned = earnedAchievements.filter(obj => {
                      return obj.id === 2;
                    })[0];
                    createAchEarned = earnedAchievements.filter(obj => {
                      return obj.id === 3;
                    })[0];
                }

                if (nomAchEarned == null) {
                    nomAchEarned = {
                        "id": 2,
                        "count": 0
                    }
                    earnedAchievements.push(nomAchEarned);
                }
                nomAchEarned["count"] = countsByTypeAndStatus["NOMINATION"]["SUBMITTED"];

                if (createAchEarned == null) {
                    createAchEarned = {
                        "id": 3,
                        "count": 0
                    }
                    earnedAchievements.push(createAchEarned);
                }
                createAchEarned["count"] = countsByTypeAndStatus["NOMINATION"]["ACCEPTED"];

                localStorage[`wfAchievements_${userHash}`] = JSON.stringify(earnedAchievements);
            });
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

    const awaitElementList = get => new Promise((resolve, reject) => {
        let triesLeft = 10;
        const queryLoop = () => {
            const ref = get();
            if (ref && ref.length > 0) resolve(ref);
            else if (!triesLeft) reject();
            else setTimeout(queryLoop, 100);
            triesLeft--;
        }
        queryLoop();
    });

    (() => {
        const css = `
        .achievement_container {
            border: 1px;
            border-radius: 3px;
            border-style: double;
            border-color: #969696;
            margin: 20px;
            padding: 10px;
            width: auto;
            display: flex;
            flex-wrap: wrap;
        }
        .achievement_box {
            border: 1px;
            border-radius: 3px;
            border-style: double;
            border-color: #ff4713;
            margin: 5px;
            padding: 4px;
            width: 32%;
            min-width: 300px;
            max-width: 400px;
            display: flex;
        }
        .achievement_img {
            padding: 2px;
            width: 25%;
            min-width: 104px;
        }
        .achievement_exp {
            padding: 6px;
            width: auto;
            min-width: 75px;
            display: flex;
            flex-direction: column;
        }
        .achievement_text {
            margin: 2px;
            width: auto;
        }
        .achievement_tier {
            padding-left: 10px;
            padding-right: 10px;
            height: 100%;
            width: 70%;
            display: flex;
            flex-direction: row;
            margin-left: auto; 
            margin-right: 0;
        }
        .achievement_ind_tier {
            padding-left: 4px;
            padding-right: 4px;
        }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    })();
})();
