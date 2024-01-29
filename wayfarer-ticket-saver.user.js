// ==UserScript==
// @name         Wayfarer Ticket Saver
// @version      0.2.2
// @description  Saves interactions with Niantic Support initiated through Wayfarer.
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-ticket-saver.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// @match        https://webchat.helpshift.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

// Copyright 2024 tehstone, bilde
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
/* eslint indent: ['error', 4] */

(() => {

    const uuid = 'eacd4454-eb3a-420d-a1bd-4948f7429a5a'; // randomly generated, unique to this userscript, please don't re-use in other scripts

    const ORIGIN_WAYFARER = 'https://wayfarer.nianticlabs.com';
    const ORIGIN_HELPSHIFT = 'https://webchat.helpshift.com';
    const OBJECT_STORE_NAME = 'supportTickets';

    const initHelp = () => {
        const send = msg => {
            GM_setValue(uuid, msg);
            GM_deleteValue(uuid);
        };

        // Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
        (function (open) {
            XMLHttpRequest.prototype.open = function (method, url) {
                if (method == 'POST') {
                    switch (url) {
                        case 'https://api.helpshift.com/websdk/niantic/conversations/history':
                        case 'https://api.helpshift.com/websdk/niantic/conversations/updates':
                            this.addEventListener('load', parseResponse, false);
                    }
                }
                open.apply(this, arguments);
            };
        })(XMLHttpRequest.prototype.open);

        function parseResponse(e) {
            try {
                const json = JSON.parse(this.responseText);
                if (!json) return;
                send(json);
            } catch (ex) {
            }
        }
    };

    const initWF = () => {
        // Opens an IDB database connection.
        // IT IS YOUR RESPONSIBILITY TO CLOSE THE RETURNED DATABASE CONNECTION WHEN YOU ARE DONE WITH IT.
        // THIS FUNCTION DOES NOT DO THIS FOR YOU - YOU HAVE TO CALL db.close()!
        const getIDBInstance = version => new Promise((resolve, reject) => {
            'use strict';

            if (!window.indexedDB) {
                reject('This browser doesn\'t support IndexedDB!');
                return;
            }

            const openRequest = indexedDB.open('wayfarer-tools-db', version);
            openRequest.onsuccess = event => {
                const db = event.target.result;
                const dbVer = db.version;
                console.log(`IndexedDB initialization complete (database version ${dbVer}).`);
                if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                    db.close();
                    console.log(`Database does not contain column ${OBJECT_STORE_NAME}. Closing and incrementing version.`);
                    getIDBInstance(dbVer + 1).then(resolve);
                } else {
                    resolve(db);
                }
            };
            openRequest.onupgradeneeded = event => {
                console.log('Upgrading database...');
                const db = event.target.result;
                if (!db.objectStoreNames.contains(OBJECT_STORE_NAME)) {
                    db.createObjectStore(OBJECT_STORE_NAME, { keyPath: 'id' });
                }
            };
        });

        const filterIssue = issue => {
            issue.id = issue.publish_id;
            issue.publish_id = undefined;
            issue.messages.forEach(msg => {
                if (msg.author) msg.author.emails = undefined;
            });
            return issue;
        }

        const humanSize = size => {
            const prefixes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
            let tmp = size;
            let index = 0;
            while (tmp > 1024) {
                index++;
                tmp /= 1024;
            }
            return (index == 0 ? tmp : tmp.toFixed(tmp < 100 ? 2 : 1)) + ' ' + prefixes[index];
        }

        const promiseCursor = (objectStore, id) => new Promise((resolve, reject) => {
            const req = objectStore.openCursor(id);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = reject;
        });

        const processUpdate = update => {
            if (update.hasOwnProperty('issues') && update.issues.length) {
                getIDBInstance().then(db => new Promise(async (resolve, reject) => {
                    const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
                    tx.oncomplete = event => { db.close(); resolve(); };
                    tx.onerror = reject;
                    const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                    for (let i = 0; i < update.issues.length; i++) {
                        const issue = filterIssue(update.issues[i]);
                        if (issue.type === 'issue') {
                            const cursor = await promiseCursor(objectStore, issue.id);
                            if (cursor) {
                                const existing = cursor.value;
                                const msgs = existing.messages;
                                const storedMsgIDs = msgs.map(msg => msg.id);
                                for (let j = 0; j < issue.messages.length; j++) {
                                    if (!storedMsgIDs.includes(issue.messages[j].id)) {
                                        msgs.push(issue.messages[j]);
                                    }
                                }
                                console.log(`Logged new message(s) for support ticket #${issue.id}`);
                                cursor.update({ ...issue, messages: msgs });
                            } else {
                                console.log(`New support ticket #${issue.id} was logged`);
                                objectStore.put(issue);
                            }
                        }
                    }
                    tx.commit();
                }));
            }
        }

        const awaitElement = get => new Promise((resolve, reject) => {
            let triesLeft = 100;
            const queryLoop = () => {
                const ref = get();
                if (ref) resolve(ref);
                else if (!triesLeft) reject();
                else setTimeout(queryLoop, 100);
                triesLeft--;
            }
            queryLoop();
        });

        const getHTMLSearchRegex = query => {
            // Generate a regex that ensures our match (query) is not part
            // of an XML start tag or entity using a negative lookahead.
            // Adapted from the spec at https://www.w3.org/TR/xml/
            // (but not guaranteed to be accurate).
            const nameStartChars =
                  ':A-Za-z_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF' +
                  '\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F' +
                  '\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD';
            const nameChars = nameStartChars +
                  '\\-\\.0-9\u00B7\u0300-\u036F\u203F-\u2040';

            const name = `([${nameStartChars}][${nameChars}]*)`;
            const entityFragment = `&(${name}|#([Xx]?(0-9A-Fa-f)*|(0-9)*))?`;
            const attrFragmentDQ = `"([^<&"]|${entityFragment};)*`;
            const attrFragmentSQ = `'([^<&']|${entityFragment};)*`;
            const attribute = `${name}\\s*=\\s*(${attrFragmentDQ}"|${attrFragmentSQ}')`;
            const attrFragment = `${name}?\\s*=?\\s*(${attrFragmentDQ}|${attrFragmentSQ})?`;
            const sTagFragment = `<${name}(\\s*${attribute})*(\\s*${attrFragment})?`;
            return new RegExp(`(?<!(${entityFragment}|${sTagFragment}))` + query.replaceAll(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
        }

        const showTicketHistoryModal = () => {
            const outer = document.createElement('div');
            outer.classList.add('wfSTH-bg');
            document.querySelector('body').appendChild(outer);

            const inner = document.createElement('div');
            inner.classList.add('wfSTH-popup');
            outer.appendChild(inner);

            const header = document.createElement('h1');
            header.textContent = 'Support ticket history';
            inner.appendChild(header);

            const closeBtn = document.createElement('div');
            closeBtn.textContent = '❌';
            closeBtn.title = 'Close';
            closeBtn.classList.add('wfSTH-close');
            closeBtn.addEventListener('click', () => {
                outer.parentNode.removeChild(outer);
            });
            inner.appendChild(closeBtn);

            const searchBtn = document.createElement('div');
            const searchBox = document.createElement('input');
            searchBtn.textContent = '🔍';
            searchBtn.title = 'Search';
            searchBtn.classList.add('wfSTH-close');
            searchBtn.addEventListener('click', () => {
                inner.removeChild(searchBtn);
                searchBox.style.display = 'block';
                searchBox.focus();
            });
            inner.appendChild(searchBtn);

            const searchCache = [];
            searchBox.placeholder = 'Search...';
            searchBox.classList.add('wfSTH-search');
            searchBox.addEventListener('input', () => {
                const query = searchBox.value.toLowerCase();
                const dummy = document.createElement('div');
                searchCache.forEach(({ issue, e, refresh }) => {
                    if (!query.length) {
                        e.style.display = 'block';
                    } else {
                        let matches = false;
                        for (let i = 0; i < issue.messages.length; i++) {
                            if ([
                                'Bot Started',
                                'Bot Ended',
                                'Confirmation Accepted'
                            ].includes(issue.messages[i].type)) continue;
                            dummy.textContent = query;
                            const queryHTML = dummy.innerHTML;
                            dummy.innerHTML = issue.messages[i].body.toLowerCase();
                            if (dummy.innerHTML.match(getHTMLSearchRegex(queryHTML))) {
                                matches = true;
                                break;
                            };
                        }
                        e.style.display = matches ? 'block' : 'none';
                    }
                    if ([...e.classList].includes('wfSTH-selected')) refresh();
                });
            });
            inner.appendChild(searchBox);

            const box = document.createElement('div');
            box.classList.add('wfSTH-box');
            inner.appendChild(box);

            const list = document.createElement('div');
            list.classList.add('wfSTH-list');
            box.appendChild(list);
            const chat = document.createElement('div');
            chat.classList.add('wfSTH-chat');
            box.appendChild(chat);

            const showTicket = (listItem, issue, refresh) => {
                document.querySelectorAll('.wfSTH-selected').forEach(e => e.classList.remove('wfSTH-selected'));
                listItem.classList.add('wfSTH-selected');
                if (!refresh) chat.scrollTop = 0;
                chat.innerHTML = '';
                console.log('Displaying issue ticket', issue);

                issue.messages.sort((a, b) => a.created_at - b.created_at);
                issue.messages.forEach(msg => {
                    switch (msg.type) {
                        case 'Bot Started':
                        case 'Bot Ended':
                        case 'Confirmation Accepted':
                            return;
                    }

                    const msgBox = document.createElement('div');
                    msgBox.classList.add('wfSTH-message');
                    msgBox.classList.add('wfSTH-msgState-' + (msg.author.roles.length == 1 && msg.author.roles[0] == 'user' ? 'sent' : 'received'));

                    const ts = document.createElement('p');
                    ts.textContent = new Date(msg.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'medium'
                    });
                    msgBox.appendChild(ts);

                    const bubble = document.createElement('div');
                    bubble.classList.add('wfSTH-chatBubble');

                    const highlightSearch = html => {
                        if (!searchBox.value.length) return html;
                        const dummy = document.createElement('div');
                        dummy.textContent = searchBox.value.toLowerCase();
                        const query = dummy.innerHTML;
                        dummy.innerHTML = html;
                        return dummy.innerHTML.replaceAll(getHTMLSearchRegex(query), '<span class="wfSTH-searchMatch">$&</span>');
                    }

                    switch (msg.type) {
                        case 'Option Input Response':
                        case 'Text Input Response':
                        case 'Text Message with Text Input':
                        case 'Text':
                            bubble.innerHTML = highlightSearch(msg.body);
                            break;

                        case 'Text Message with Option Input':
                            bubble.innerHTML = highlightSearch(msg.body);
                            if (msg.input && msg.input.options) {
                                msg.input.options.forEach(opt => {
                                    const eOpt = document.createElement('div');
                                    eOpt.classList.add('wfSTH-mt-option');
                                    eOpt.textContent = opt.title;
                                    bubble.appendChild(eOpt);
                                });
                            }
                            break;

                        case 'Attachment':
                            msg.attachments.forEach(file => {
                                const head = document.createElement('p');
                                head.textContent = '📎 Attachment';
                                head.style.fontWeight = 'bold';
                                bubble.appendChild(head);
                                const name = document.createElement('p');
                                const nameA = document.createElement('a');
                                nameA.textContent = file.file_name;
                                nameA.href = file.url;
                                nameA.target = '_blank';
                                name.appendChild(nameA);
                                bubble.appendChild(name);
                                const data = document.createElement('p');
                                data.textContent = `${humanSize(file.size)} (${file.content_type})`;
                                data.style.opacity = '0.6';
                                bubble.appendChild(data);
                            });
                            break;

                        default:
                            bubble.innerHTML = highlightSearch(msg.body);
                            const errMsg = document.createElement('p');
                            errMsg.style.color = 'red';
                            errMsg.textContent = `Unknown message type ${msg.type}, please report to addon developer!`;
                            msgBox.appendChild(errMsg);
                    }

                    msgBox.appendChild(bubble);
                    chat.appendChild(msgBox);
                });
            };

            getIDBInstance().then(db => {
                const tx = db.transaction([OBJECT_STORE_NAME], 'readonly');
                tx.oncomplete = event => db.close();
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const getAllTickets = objectStore.getAll();
                getAllTickets.onsuccess = () => {
                    const { result } = getAllTickets;
                    result.sort((a, b) => b.created_at - a.created_at);
                    result.forEach(issue => {
                        const listItem = document.createElement('div');
                        listItem.classList.add('wfSTH-listitem');
                        list.appendChild(listItem);
                        const h3 = document.createElement('h3');
                        h3.textContent = `Ticket #${issue.id}`;
                        listItem.appendChild(h3);
                        const timestamp = document.createElement('p');
                        timestamp.textContent = new Date(issue.created_at).toLocaleString(undefined, {
                            dateStyle: 'long',
                            timeStyle: 'long'
                        });
                        listItem.appendChild(timestamp);
                        listItem.addEventListener('click', () => showTicket(listItem, issue, false));
                        searchCache.push({ issue, e: listItem, refresh: () => showTicket(listItem, issue, true) });
                    });
                }
            });
        }

        const createSidebarItem = () => awaitElement(() => document.querySelector('app-sidebar-link')).then(sidebar => {
            const image = document.createElement('img');
            image.classList.add('sidebar-link__icon');
            image.style.width = '24px';
            image.src = 'data:image/svg+xml;base64,'
                + 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+Cjxzdmcgdmlld0JveD0iMCAwIDc'
                + '1LjExNzcwNiA1Ny43NTQ3MTYiIHZlcnNpb249IjEuMSIgd2lkdGg9Ijc1LjExNzcwNiIgaGVpZ2h0PSI1Ny43NTQ3MTkiIHhtbG'
                + '5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6c3ZnPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgP'
                + 'HBhdGggZD0ibSAzNy42MTQ3MDksMCBjIC0yMC43MTIsMCAtMzcuNTAyOTk5NTQsMTEuMjY0IC0zNy41MDI5OTk1NCwyNS4xNjYg'
                + 'MCw3LjQ5NCA0Ljg4NTAwMDA0LDE0LjIxOCAxMi42Mjc5OTk1NCwxOC44MjggLTEuNjQ4LDMuMDU0IC00LjkwNDk5OTUsNi45NTE'
                + 'gLTExLjYzOTk5OTUsMTIuMjM0IC0xLjEwMDAwMDAzNjczLDAuODYyIC0yLjQ3NCwyLjExIDEuOTc0LDEuMjIxIDcuNDQ3OTk5NS'
                + 'wtMS40OSAxNS4zOTU5OTk1LC01LjI4OCAyMS40NTQ5OTk1LC04LjY5MyA0LjA3NSwxLjAxOSA4LjQ4MiwxLjU3NyAxMy4wODcsM'
                + 'S41NzcgMjAuNzExLDAgMzcuNTAyLC0xMS4yNjQgMzcuNTAyLC0yNS4xNjYgMCwtMTMuOTAyIC0xNi43OTIsLTI1LjE2NyAtMzcu'
                + 'NTAzLC0yNS4xNjcgeiIgLz4KPC9zdmc+Cg==';
            const text = document.createElement('span');
            text.textContent = 'Tickets';
            const a = document.createElement('a');
            a.classList.add('sidebar-link');
            a.appendChild(image);
            a.appendChild(text);
            a.addEventListener('click', showTicketHistoryModal);
            const item = document.createElement('div');
            item.appendChild(a);
            item.id = 'wfSTH-sidebar-item';
            sidebar.parentNode.appendChild(item);
        });

        awaitElement(() => document.querySelector('app-sidebar-link')).then(sidebar => {
            createSidebarItem;
            setInterval(() => {
                if (!document.getElementById('wfSTH-sidebar-item')) createSidebarItem();
            }, 100);
        });

        GM_addValueChangeListener(uuid, (label, _before, after) => {
            if (label === uuid && typeof after !== 'undefined') {
                processUpdate(after);
            }
        });

        (() => {
            const css = `
            .wfSTH-bg {
                position: fixed;
                top: 0;
                left: 0;
                height: 100vh;
                width: 100vw;
                background-color: rgba(0,0,0,0.5);
                z-index: 100000;
            }
            .wfSTH-popup {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translateX(-50%) translateY(-50%);
                width: calc(100vw - 50px);
                height: calc(100vh - 50px);
                overflow-x: hidden;
                overflow-y: scroll;
                background-color: #fff;
                padding: 20px;
                max-width: 900px;
            }
            .dark .wfSTH-popup {
                background-color: #333;
            }
            .wfSTH-popup h1 {
                margin-bottom: 20px;
                width: calc(70% - 70px);
                float: left;
            }
            .wfSTH-search {
                width: 30%;
                padding: 0.7em;
                font-size: 1.1em;
                background-color: #ddd;
                float: right;
                display: none;
            }
            .dark .wfSTH-search {
                background-color: #222;
            }
            .wfSTH-searchMatch {
                background-color: yellow;
                color: black;
                display: inline-block;
                box-shadow: 0 0 4px rgba(0,0,0,0.5);
                white-space: pre;
            }
            .wfSTH-close {
                z-index: 2;
                font-size: 2em;
                cursor: pointer;
                opacity: 0.5;
                float: right;
                margin-left: 14px;
            }
            .wfSTH-close:hover {
                opacity: 1;
            }
            .wfSTH-box {
                height: calc(100% - 60px);
                display: flex;
                background-color: #ddd;
                clear: both;
            }
            .dark .wfSTH-box {
                background-color: #222;
            }
            .wfSTH-box > div {
                height: 100%;
            }
            .wfSTH-list {
                width: 40%;
                background-color: #eee;
                overflow-y: scroll;
                border-right: 3px solid #fff;
            }
            .dark .wfSTH-list {
                background-color: #2a2a2a;
                border-right: 3px solid #333;
            }
            .wfSTH-chat {
                width: 60%;
                overflow-y: scroll;
                padding-bottom: 15px;
            }
            .wfSTH-listitem {
                padding: 10px;
                border-bottom: 3px solid #fff;
                cursor: pointer;
                white-space: nowrap;
            }
            .wfSTH-listitem p {
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .dark .wfSTH-listitem {
                border-bottom: 3px solid #333;
            }
            .wfSTH-selected {
                background-color: #ddd;
                cursor: default;
            }
            .dark .wfSTH-selected {
                background-color: #222;
            }
            .wfSTH-message {
                padding: 15px;
                clear: both;
            }
            .wfSTH-chatBubble {
                border-radius: 8px;
                max-width: 270px;
                padding: 10px;
            }
            .wfSTH-chatBubble a {
                text-decoration: underline;
            }
            .wfSTH-msgState-sent .wfSTH-chatBubble a {
                color: white;
            }
            .wfSTH-msgState-received .wfSTH-chatBubble a {
                color: black;
            }
            .wfSTH-msgState-sent .wfSTH-chatBubble {
                background-color: rgb(216, 88, 19);
                color: white;
                float: right;
            }
            .wfSTH-msgState-received .wfSTH-chatBubble {
                background-color: white;
                color: black;
                float: left;
            }
            .wfSTH-message > p {
                font-size: 0.8em;
                opacity: 0.8;
                margin: 3px;
            }
            .wfSTH-msgState-received > p {
                text-align: left;
            }
            .wfSTH-msgState-sent > p {
                text-align: right;
            }
            .wfSTH-mt-option {
                background-color: #eee;
                padding: 5px;
                margin-top: 5px;
                border: 1px solid #ccc;
            }
            `;
            const style = document.createElement('style');
            style.type = 'text/css';
            style.innerHTML = css;
            document.querySelector('head').appendChild(style);
        })();
    };

    if (window.origin === ORIGIN_HELPSHIFT) {
        initHelp();
    } else if (window.origin === ORIGIN_WAYFARER) {
        initWF();
    }
})();
