// ==UserScript==
// @name         Wayfarer Email Import API
// @version      2.1.0
// @description  API for importing Wayfarer-related emails and allowing other scripts to read and parse them
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-email-api.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// ==/UserScript==

// Copyright 2024 tehstone, bilde, tnt
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

/* ============================ API DOCUMENTATION ========================= *\

The API is available under: window.wft_plugins_api.emailImport

API.prepare ()
    returns: Promise
    \- resolves: undefined

    Prepares the API for usage by another script. This function must be called before other scripts open IDB
    connections. It serves to ensure that the importedEmails object store exists in the database before usage to
    avoid deadlocks with API consumers which also use IDB connections.

API.get (id: str)
    returns: Promise
    |- resolves: WayfarerEmail
    \- rejects: Error?

    Retrieves the email represented by the given Message-ID. Rejects if email with given ID is not found, or
    if the email database could not be opened. In the former case nothing is returned, in the latter case,
    an Error is returned by the promise.

    Before calling this function, API.prepare() must have been called and awaited at least once to avoid
    deadlocks. Otherwise, an error is thrown.

API.iterate async* ()
    yields: WayfarerEmail
    throws: Error

    Returns an asynchronous generator that iterates over all emails that have been imported to the local
    database. The generator must be fully iterated, otherwise the database will not be closed!

    Example usage:
    for await (const email of API.iterate()) {
        console.log('Processing email', email);
    }

    Before calling this function, API.prepare() must have been called and awaited at least once to avoid
    deadlocks. Otherwise, an error is thrown.

API.addListener (id: str, listener: object)
    returns: undefined

    Adds a listener to imported email messages for real-time processing during imports. The listener object
    should have properties consisting of event handlers for events you are interested in. All of the event
    handlers must be async, or return a Promise, or otherwise be awaitable. Each handler will be awaited, and
    processing in this script will not continue until your event handler has returned in order to avoid race
    conditions. The following event handlers will be called if they are declared:

    onEmailImported: async (email: WayfarerEmail)
        Called with a WayfarerEmail instance whenever a new email is imported to the database.

    onEmailReplaced: async (email: WayfarerEmail)
        Called with a WayfarerEmail instance whenever an email that already exists in the database is replaced
        with a new version originating from closer to Niantic's email servers. When emails are forwarded over
        multiple hops, some information may be lost in the process - in particular, multipart emails may be
        flattened to contain only a text/html document instead of both text/html and text/plain. When this event
        is fired, the email already exists in the database, but it may contain more information than the first
        time it was sent to onEmailImported, and could thus be valuable for re-processing depending on your
        specific scenario and use case.

    onImpendingImport: async ()
        Called when an email import process is about to start. If your code depends on the wayfarer-tools-db IDB
        database, and it is not guaranteed to have been version-upgraded to support your object store before
        this stage - i.e. if it is possible that the first time you use this database is upon email imports -
        you MUST hook this event handler and use it to open and subsequently close your database to ensure that
        the database schema is upgraded and ready for the import.

    onImportStarted: async ()
        Called whenever the email import process is started. Can be used to e.g. open an IDB database. The
        wayfarer-tools-db IDB database may NOT be version-upgraded at this stage. If your code uses this
        database, and does not otherwise guarantee that the database is fully upgraded to support your schema
        before an import is started, you MUST open and close the database to trigger any potential version
        upgrades using the onImpendingImport event handler. If you fail to do this and a version upgrade is
        required, during the import process, your IDBOpenDBRequest will throw the "blocked" event.

    onImportCompleted: async ()
        Called whenever the email import process completes. Can be used to e.g. close an open IDB database.

API.stripDiacritics (text: str)
    returns: str

    Niantic will often strip diacritic marks from Wayspot titles/descriptions when they are sent in emails to
    end users. This can make title matching difficult, because the Wayfarer website does not strip diacritics.
    Strings passed to this function will be returned with their diacritic marks removed, to emulate the process
    applied by Niantic's email system. This can make it easier to match Wayfarer-sourced wayspot data against
    data sourced from imported emails.

WayfarerEmail.originatingFilename
    property: str (read-only)

    Returns the filename of the email at the time it was imported. For *.eml imports, this will be the real name
    of the file. For emails imported from third-party APIs that do not provide a filename, the name will be
    generated, based on some identifier if one is available. In either case, filenames returned by this property
    are NOT guaranteed to be unique.

WayfarerEmail.messageID
    property: str (read-only)

    Returns the ID of this email. The ID can be passed to API.get() to return this email. The ID is based on the
    Message-ID header of the email and is globally unique.

WayfarerEmail.importedDate
    property: Date (read-only)

    Returns a Date object representing the exact time this email was last imported to the local database.

WayfarerEmail.getHeader (header: str, asList: ?bool)
    returns: str?|array

    Returns the value(s) of the given MIME message header (case insensitive).
    This function can return one of three value types:

    | Scenario                             | asList = false  | asList = true   |
    | ------------------------------------ | --------------- | --------------- |
    | Header was not found                 | null            | []              |
    | One matching header was found        | "value"         | ["value"]       |
    | Multiple matching headers were found | ["v1","v2",...] | ["v1","v2",...] |

    asList is optional and defaults to false.

WayfarerEmail.getBody (contentType: str)
    returns: str?

    Returns the body of the email in the given Content-Type format. Accepted values are usually one of
    ["text/html", "text/plain"]. Returns null if the email does not have an alternative body that matches the
    requested Content-Type. This is a convenience wrapper around getMultipartAlternatives().

WayfarerEmail.getMultipartAlternatives ()
    returns: object

    Returns a list of multipart alternative messages from the body of the email, mapped as an object where the
    keys are Content-Types and values are the corresponding message with that Content-Type extracted from the
    multipart/alternative message. The available keys are usually ["text/plain", "text/html"]. If the message is
    not multipart/alternative, the return value is an object with a single key, where the key is the email's
    Content-Type and the value is the body in its entirety.

WayfarerEmail.getDocument ()
    returns: HTMLDocument?

    Returns the body of the email as a DOM if the email is text/html or has a valid text/html multipart
    alternative. If the email does not have a text/html body, this function returns null.

WayfarerEmail.classify ()
    returns: object

    Attempts to classify the email into a type. The result is an object with the following properties:

    - type (str): The type of contribution, e.g. NOMINATION_RECEIVED, EDIT_DECIDED, etc.
    - style (str): The visual style of the email, e.g. POKEMON_GO, WAYFARER, etc.
    - language (str): ISO-639-1 language code representing this email's language

    If classification fails, an error is thrown.

WayfarerEmail.display ()
    returns: undefined

    Displays the email message in a popup window.

\* ======================================================================== */

(() => {
    const OBJECT_STORE_NAME = 'importedEmails';
    const apiEventListeners = {};
    const DEBUGGING_MODE = false;
    let isPrepared = false;

    // Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
    (function (open) {
        XMLHttpRequest.prototype.open = function(method, url) {
            const args = this;
            if (url == '/api/v1/vault/manage' && method == 'GET') {
                this.addEventListener('load', handleXHRResult(handleNominations), false);
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

    const handleNominations = () => {
        addImportButton();
    };

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

    const iterateIDBCursor = async function*() {
        const db = await getIDBInstance();
        const getOS = () => db.transaction([OBJECT_STORE_NAME], 'readonly').objectStore(OBJECT_STORE_NAME);
        const keys = await new Promise((resolve, reject) => getOS().getAllKeys().onsuccess = event => resolve(event.target.result));
        for (let i = 0; i < keys.length; i++) {
            yield await new Promise((resolve, reject) => getOS().get(keys[i]).onsuccess = event => resolve(event.target.result));
        }
        db.close();
    };

    const getProcessedEmailIDs = () => new Promise(async (resolve, reject) => {
        const ids = [];
        for await (const obj of iterateIDBCursor()) {
            for (let i = 0; i < obj.pids.length; i++) {
                ids.push(obj.pids[i]);
            }
        }
        resolve(ids);
    });

    const selfAPI = {
        prepare: () => new Promise((resolve, reject) => {
            if (!isPrepared) {
                getIDBInstance().then(db => {
                    // Ensure that the importedEmails object store exists to avoid deadlocks.
                    console.log('Email API is preparing...');
                    db.close();
                    isPrepared = true;
                    console.log('Email API is now ready for use.');
                    resolve();
                });
            } else {
                resolve();
            }
        }),

        get: id => new Promise((resolve, reject) => {
            if (!isPrepared) throw new Error('Attempted usage of Email API .get() before invocation of .prepare()');
            getIDBInstance().then(db => {
                const tx = db.transaction([OBJECT_STORE_NAME], 'readonly');
                tx.oncomplete = event => db.close();
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const getEmail = objectStore.get(id);
                getEmail.onsuccess = () => {
                    const { result } = getEmail;
                    if (result) resolve(new WayfarerEmail(result));
                    else reject();
                };
                getEmail.onerror = () => reject(getEmail.error);
            })
        }),

        iterate: async function*() {
            if (!isPrepared) throw new Error('Attempted usage of Email API .iterate() before invocation of .prepare()');
            for await (const obj of iterateIDBCursor()) {
                yield new WayfarerEmail(obj);
            }
        },

        addListener: (id, listener) => {
            apiEventListeners[id] = listener;
            console.log('Added email event listener with ID', id);
        },

        stripDiacritics: text => {
            const map = {
                A: 'ÀÁÂÃÅÄĀĂĄǍǞǠǺȀȂȦ',
                C: 'ÇĆĈĊČ',
                D: 'Ď',
                E: 'ÈÊËÉĒĔĖĘĚȄȆȨ',
                G: 'ĜĞĠĢǦǴ',
                H: 'ĤȞ',
                I: 'ÌÍÎÏĨĪĬĮİǏȈȊ',
                J: 'Ĵ',
                K: 'ĶǨ',
                L: 'ĹĻĽ',
                N: 'ÑŃŅŇǸ',
                O: 'ÒÔÕÓÖŌŎŐƠǑǪǬȌȎȪȬȮȰ',
                R: 'ŔŖŘȐȒ',
                S: 'ŚŜŞŠȘ',
                T: 'ŢŤȚ',
                U: 'ÙÚÛÜŨŪŬŮŰŲƯǓǕǗǙǛȔȖ',
                W: 'Ŵ',
                Y: 'ÝŶŸȲ',
                Z: 'ŹŻŽ',
                a: 'àáâãåäāăąǎǟǡǻȁȃȧ',
                c: 'çćĉċč',
                d: 'ď',
                e: 'èêëéēĕėęěȅȇȩ',
                g: 'ĝğġģǧǵ',
                h: 'ĥȟ',
                i: 'ìíîïĩīĭįǐȉȋ',
                j: 'ĵǰ',
                k: 'ķǩ',
                l: 'ĺļľ',
                n: 'ñńņňǹ',
                o: 'òôõóöōŏőơǒǫǭȍȏȫȭȯȱ',
                r: 'ŕŗřȑȓ',
                s: 'śŝşšș',
                t: 'ţťț',
                u: 'ùúûüũūŭůűųưǔǖǘǚǜȕȗ',
                w: 'ŵ',
                y: 'ýÿŷȳ',
                z: 'źżž',
                Æ: 'ǢǼ',
                Ø: 'Ǿ',
                æ: 'ǣǽ',
                ø: 'ǿ',
                Ʒ: 'Ǯ',
                ʒ: 'ǯ',
                "'": '"'
            };
            for (const k in map) {
                if (map.hasOwnProperty(k)) {
                    text = text.replaceAll(new RegExp(`[${map[k]}]`, 'g'), k);
                }
            }
            return text.normalize('NFD');
        }
    };

    if (DEBUGGING_MODE) {
        console.log('Email API debugger API:', {
            makeDebugEmail: obj => new WayfarerEmail(obj),
            readDebugEmail: () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'message/rfc822,*.eml';
                input.style.display = 'none';
                input.addEventListener('change', async e => {
                    console.log(e.target);
                    const content = await e.target.files[0].text();
                    const mime = parseMIME(content);
                    if (!mime) throw new Error('This file does not appear to be an email in MIME format (invalid RFC 822 data).');
                    const [ headers, body ] = mime;
                    const obj = {
                        id: headers.find(e => e[0].toLowerCase() == 'message-id'),
                        pids: [],
                        filename: 'debug-email.eml',
                        ts: Date.now(),
                        headers, body
                    };
                    console.log(new WayfarerEmail(obj));
                });
                document.querySelector('body').appendChild(input);
                input.click();
            }
        });
    }

    const windowRef = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (!windowRef.wft_plugins_api) windowRef.wft_plugins_api = {};
    windowRef.wft_plugins_api.emailImport = selfAPI;

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

    const createBackground = () => {
        const outer = document.createElement('div');
        outer.classList.add('wfeiApiImportBg');
        document.querySelector('body').appendChild(outer);
        return outer;
    };

    const createEmailLoader = () => {
        const outer = createBackground();
        const loadingHeader = document.createElement('h2');
        loadingHeader.textContent = 'Importing...';
        const loadingStatus = document.createElement('p');
        loadingStatus.textContent = 'Please wait';
        const loadingDiv = document.createElement('div');
        loadingDiv.classList.add('wfeiApiImportLoading');
        loadingDiv.appendChild(loadingHeader);
        loadingDiv.appendChild(loadingStatus);
        outer.appendChild(loadingDiv);
        return {
            setTitle: text => { loadingHeader.textContent = text },
            setStatus: text => { loadingStatus.textContent = text },
            destroy: () => outer.parentNode.removeChild(outer)
        };
    };

    const dispatchEmailEvent = async (type, ...args) => {
        for (const [k, v] of Object.entries(apiEventListeners)) {
            const ek = 'on' + type;
            if (v.hasOwnProperty(ek)) {
                try {
                    await v[ek](...args);
                } catch (e) {
                    console.error('Email event listener threw an exception', args, e);
                }
            }
        }
    };

    const importFromIterator = (loader, iterator, count, callback) => {
        dispatchEmailEvent('ImpendingImport').then(() => {
            getIDBInstance().then(db => {
                storeEmails(db, iterator, count, (n, t) => {
                    loader.setStatus(`Processing email ${n} of ${t}`);
                }).then(counters => {
                    db.close();
                    console.log('Successfully imported emails', counters);
                    loader.destroy();
                    if (callback) callback();
                });
            }).catch(e => {
                loader.setStatus('An error occurred');
                console.error(e);
            });
        });
    };

    const importFromEml = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = 'multiple';
        input.accept = 'message/rfc822,*.eml';
        input.style.display = 'none';
        input.addEventListener('change', e => {
            const loader = createEmailLoader();
            loader.setTitle('Parsing...');
            loader.setStatus('Please wait');
            const fileCount = e.target.files.length;
            const iterator = async function*() {
                for (let i = 0; i < fileCount; i++) {
                    yield {
                        name: e.target.files[i].name,
                        contents: await e.target.files[i].text()
                    };
                }
            };
            importFromIterator(loader, iterator, fileCount);
        });
        document.querySelector('body').appendChild(input);
        input.click();
    };

    const importFromGAScript = () => {
        const outer = createBackground();
        const inner = document.createElement('div');
        inner.classList.add('wfeiApiImportInner');
        inner.classList.add('wfeiApiImportGAScriptOptions');
        outer.appendChild(inner);
        const header = document.createElement('h1');
        header.textContent = 'Import using Google Apps Script';
        inner.appendChild(header);
        const sub = document.createElement('p');
        const s1 = document.createElement('span');
        s1.textContent = 'Please enter your Importer Script details below. New to the Importer Script? ';
        const s2 = document.createElement('a');
        s2.textContent = 'Please click here';
        s2.addEventListener('click', () => {
            const b = new Blob([userManualGAS], { type: 'text/html' });
            const bUrl = URL.createObjectURL(b);
            window.open(bUrl, '_blank', 'popup');
        });
        const s3 = document.createElement('span');
        s3.textContent = ' for detailed setup instructions.';
        sub.appendChild(s1);
        sub.appendChild(s2);
        sub.appendChild(s3);
        inner.appendChild(sub);
        const form = document.createElement('form');
        inner.appendChild(form);
        const tbl = document.createElement('table');
        tbl.classList.add('wfeiApiGAScriptTable');
        form.appendChild(tbl);

        const inputs = [
            {
                id: 'url',
                type: 'text',
                label: 'Script URL',
                placeholder: 'https://script.google.com/macros/.../exec',
                required: true
            },
            {
                id: 'token',
                type: 'password',
                label: 'Access token',
                required: true
            },
            {
                id: 'since',
                type: 'date',
                label: 'Search emails starting from'
            }
        ];

        const values = localStorage.hasOwnProperty('wfeiApiGAScriptSettings') ? JSON.parse(localStorage.wfeiApiGAScriptSettings) : { };

        inputs.forEach(input => {
            const row = document.createElement('tr');
            const col1 = document.createElement('td');
            col1.textContent = `${input.label}:`;
            const col2 = document.createElement('td');
            input.field = document.createElement('input');
            input.field.type = input.type;
            if (input.required) input.field.required = true;
            if (input.placeholder) input.field.placeholder = input.placeholder;
            if (values.hasOwnProperty(input.id)) input.field.value = values[input.id];
            col2.appendChild(input.field);
            row.appendChild(col1);
            row.appendChild(col2);
            tbl.appendChild(row);
        });

        const btn1 = document.createElement('input');
        btn1.type = 'submit';
        btn1.classList.add('wfeiApiTopButton');
        btn1.value = 'Start import';
        form.appendChild(btn1);

        const btn2 = document.createElement('input');
        btn2.type = 'button';
        btn2.classList.add('wfeiApiTopButton');
        btn2.classList.add('wfeiApiCancelButton');
        btn2.value = 'Cancel import';
        btn2.addEventListener('click', () => outer.parentNode.removeChild(outer));
        form.appendChild(btn2);

        form.addEventListener('submit', e => {
            e.preventDefault();
            const gass = {
                url: inputs[0].field.value,
                token: inputs[1].field.value,
                since: inputs[2].field.value
            };
            localStorage.wfeiApiGAScriptSettings = JSON.stringify(gass);
            outer.parentNode.removeChild(outer);
            const loader = createEmailLoader();
            loader.setTitle('Connecting...');
            loader.setStatus('Validating script credentials');
            const createFetchOptions = object => ({
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(object)
            });
            fetch(gass.url, createFetchOptions({ request: "test", token: gass.token })).then(response => response.json()).then(async data => {
                if (data.status !== "OK") {
                    alert('Credential validation failed. Please double check your access token and script URL.');
                    loader.destroy();
                } else {
                    const startTime = new Date();
                    loader.setStatus('Searching for new emails');
                    const processedIDs = await getProcessedEmailIDs();
                    const ids = [];
                    let count = 0, size = 500, totalFetched = 0;
                    do {
                        const batch = await fetch(gass.url, createFetchOptions({
                            request: "list",
                            token: gass.token,
                            options: {
                                since: gass.since,
                                offset: totalFetched,
                                size
                            }
                        })).then(response => response.json());
                        if (batch.status !== "OK") throw new Error("Email listing failed");
                        count = batch.result.length;
                        totalFetched += count;
                        batch.result.forEach(id => {
                            if (!processedIDs.includes('G-' + id)) ids.push(id);
                        });
                        loader.setStatus(`Searching for new emails (${ids.length}/${totalFetched})`);
                    } while (count == size);
                    const totalCount = ids.length;
                    loader.setTitle('Downloading...');
                    loader.setStatus('Please wait');
                    const dlBatchSize = 20;
                    let offset = 0;
                    let iterSuccess = true;
                    const iterator = async function*() {
                        try {
                            let batch = [];
                            while (ids.length) {
                                while (batch.length < 20 && ids.length) batch.push(ids.shift());
                                loader.setTitle('Downloading...');
                                loader.setStatus(`Downloading ${offset + 1}-${offset + batch.length} of ${totalCount}`);
                                const emlMap = await fetch(gass.url, createFetchOptions({
                                    request: "fetch",
                                    token: gass.token,
                                    options: {
                                        ids: batch
                                    }
                                })).then(response => response.json());
                                if (emlMap.status !== "OK") throw new Error("Email listing failed");
                                loader.setTitle('Parsing...');
                                for (const id in emlMap.result) {
                                    yield {
                                        name: `${id}.eml`,
                                        contents: emlMap.result[id],
                                        id: 'G-' + id
                                    };
                                }
                                offset += batch.length;
                                batch = [];
                            }
                        } catch (e) {
                            iterSuccess = false;
                            console.error(e);
                            alert('An error occurred fetching emails from Google. You may have to continue importing from the same date again to ensure all emails are downloaded.');
                        }
                    };
                    importFromIterator(loader, iterator, totalCount, () => {
                        if (iterSuccess) {
                            const newSince = utcDateToISO8601(shiftDays(startTime, -1));
                            gass.since = newSince;
                            localStorage.wfeiApiGAScriptSettings = JSON.stringify(gass);
                        }
                    });
                }
            }).catch(e => {
                console.error(e);
                alert('The Importer Script returned an invalid response. Please see the console for more information.');
                loader.destroy();
            });
            return false;
        });
    };

    const importMethods = [
        {
            title: 'From *.eml files',
            description: 'Import email files saved and exported from an email client, such as Thunderbird',
            callback: importFromEml,
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgdmVyc2lvbj0iMS4xIgogICBpZD0iTGF5ZXJfMSIKICAgeD0iMHB4IgogICB5PSIwcHgiCiAgIHdpZHRoPSIyODM0LjkzOCIKICAgaGVpZ2h0PSIyOTAyLjE5MzEiCiAgIHZpZXdCb3g9IjAgMCAyODM0LjkzNzkgMjkwMi4xOTMxIgogICBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCA1MzU2LjkyOSA1MDE0Ljk5NyIKICAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogICB4bWxuczpzdmc9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcwogICAgIGlkPSJkZWZzNDMiIC8+CiAgPGcKICAgICBpZD0iZzM4IgogICAgIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xMzE1LjQ2NCwtOTQ2LjkxMikiPgogICAgPGcKICAgICAgIGlkPSJnMzYiPgogICAgICA8cGF0aAogICAgICAgICBmaWxsPSIjZjM3MDViIgogICAgICAgICBkPSJtIDQwMzUuNDcsMjA0OS44NzkgYyAtMzAuMTYzLC0xOC4zMjEgLTY0LjE3MiwtMjkuNTg3IC0xMDAuODAyLC0yOS41ODcgSCAxNTMxLjExNyBjIC00OC40NSwwIC05Mi42MzUsMTguNzY3IC0xMjguNjk0LDQ5LjQ2MiBsIDEyMTguNzY1LDkzMi43NzkgNC40NzksMS4zNzggLTQuNDc5LDIuNzA2IDEwNi44MTMsODEuNzU0IDEwOC4zNTMsLTg1LjgzOCAtNC4yODgsLTIuNzI5IDQuMjg4LC0xLjI1NyB6IgogICAgICAgICBpZD0icGF0aDYiIC8+CiAgICAgIDxwYXRoCiAgICAgICAgIGZpbGw9IiNmMzcwNWIiCiAgICAgICAgIGQ9Im0gMTQwMi40MiwyMDczLjc5NiBjIDAsMCAxMTY0LjUxMSwtMTEyNi44ODQgMTMzNS41MDEsLTExMjYuODg0IDE3MS4wNjcsMCAxMjk3LjU1MywxMTA2Ljk4IDEyOTcuNTUzLDExMDYuOTggeiIKICAgICAgICAgaWQ9InBhdGg4IiAvPgogICAgICA8ZwogICAgICAgICBpZD0iZzI0Ij4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjE5MDIuMDc4IgogICAgICAgICAgIHk9IjE3NTQuNzI3MSIKICAgICAgICAgICBmaWxsPSIjZmZmZmZmIgogICAgICAgICAgIHdpZHRoPSIxNjkzLjc1MSIKICAgICAgICAgICBoZWlnaHQ9IjE5NzYuMDUyIgogICAgICAgICAgIGlkPSJyZWN0MTAiIC8+CiAgICAgICAgPHJlY3QKICAgICAgICAgICB4PSIyMDIxLjc2NCIKICAgICAgICAgICB5PSIxOTI2LjA0MzkiCiAgICAgICAgICAgZmlsbD0iI2ZmZDA2NiIKICAgICAgICAgICB3aWR0aD0iMTQ1NC4zMDgiCiAgICAgICAgICAgaGVpZ2h0PSI4OC40MDQ5OTkiCiAgICAgICAgICAgaWQ9InJlY3QxMiIgLz4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjIwMjEuNzY0IgogICAgICAgICAgIHk9IjIzMzAuOTc0MSIKICAgICAgICAgICBmaWxsPSIjZmZkMDY2IgogICAgICAgICAgIHdpZHRoPSIxNDU0LjMwOCIKICAgICAgICAgICBoZWlnaHQ9Ijg4LjM2MSIKICAgICAgICAgICBpZD0icmVjdDE0IiAvPgogICAgICAgIDxyZWN0CiAgICAgICAgICAgeD0iMjAyMS43NjQiCiAgICAgICAgICAgeT0iMjEyOC41MTM5IgogICAgICAgICAgIGZpbGw9IiNmZmQwNjYiCiAgICAgICAgICAgd2lkdGg9IjE0NTQuMzA4IgogICAgICAgICAgIGhlaWdodD0iODguMzkxOTk4IgogICAgICAgICAgIGlkPSJyZWN0MTYiIC8+CiAgICAgICAgPHJlY3QKICAgICAgICAgICB4PSIyMDIxLjc2NCIKICAgICAgICAgICB5PSIyNTMzLjQzNDEiCiAgICAgICAgICAgZmlsbD0iI2ZmZDA2NiIKICAgICAgICAgICB3aWR0aD0iMTQ1NC4zMDgiCiAgICAgICAgICAgaGVpZ2h0PSI4OC4zMzAwMDIiCiAgICAgICAgICAgaWQ9InJlY3QxOCIgLz4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjIwMjEuNzY0IgogICAgICAgICAgIHk9IjI3MjIuNzEiCiAgICAgICAgICAgZmlsbD0iI2ZmZDA2NiIKICAgICAgICAgICB3aWR0aD0iMTQ1NC4zMDgiCiAgICAgICAgICAgaGVpZ2h0PSI4OC40MDQ5OTkiCiAgICAgICAgICAgaWQ9InJlY3QyMCIgLz4KICAgICAgICA8cmVjdAogICAgICAgICAgIHg9IjIwMjEuNzY0IgogICAgICAgICAgIHk9IjI5MjUuMjA4IgogICAgICAgICAgIGZpbGw9IiNmZmQwNjYiCiAgICAgICAgICAgd2lkdGg9IjE0NTQuMzA4IgogICAgICAgICAgIGhlaWdodD0iODguMzIzOTk3IgogICAgICAgICAgIGlkPSJyZWN0MjIiIC8+CiAgICAgIDwvZz4KICAgICAgPGcKICAgICAgICAgaWQ9ImczNCI+CiAgICAgICAgPHBvbHlnb24KICAgICAgICAgICBmaWxsPSIjNjZiYmM5IgogICAgICAgICAgIHBvaW50cz0iMjU1Mi42MzQsMjk1NC4wNjkgMjU1Mi44NCwyOTU0LjIzMSAyNTE2LjEyMSwyOTI2LjA4MiAiCiAgICAgICAgICAgaWQ9InBvbHlnb24yNiIgLz4KICAgICAgICA8cGF0aAogICAgICAgICAgIGZpbGw9IiNmN2JhMWQiCiAgICAgICAgICAgZD0ibSAyNTUyLjg0LDI5NTQuMjMxIC0wLjIwNiwtMC4xNjIgLTM2LjUxMywtMjcuOTg3IC0zNDEuODkyLC0yNjEuNTQ5IC03NzEuODA2LC01OTAuNzM2IGMgLTUyLjQwMSw0NC43NjIgLTg2Ljk1OSwxMTUuMzgyIC04Ni45NTksMTk1LjYxNiB2IDEzMzQuNTY5IGMgMCw2OS45MzUgMjYuMDY5LDEzMi41NTEgNjcuMzc2LDE3Ny4xODkgbCA5NTkuMTI1LC01OTkuOTI4IDI3OS4yMjQsLTE3NC42MjEgeiIKICAgICAgICAgICBpZD0icGF0aDI4IiAvPgogICAgICAgIDxwYXRoCiAgICAgICAgICAgZmlsbD0iI2Y3YmExZCIKICAgICAgICAgICBkPSJtIDQwMzUuNDcsMjA1My44OTYgLTg5Ni43ODUsNzA5LjU4NSB2IDAgbCAtMTg5LjYyMSwxNTAuMDc0IC05Ni42MjQsNzYuMzY2IC0xNi4wOTMsMTIuNjA4IDMzOS43ODUsMjE2LjQzMiA4OTcuMjY5LDU3MS40MTIgYyA0Ni43MDYsLTQ0Ljk1MSA3Ny4wMDEsLTExMS4yODIgNzcuMDAxLC0xODYuMzk1IFYgMjI2OS40MSBjIDAsLTkzLjgxNSAtNDYuOTEzLC0xNzQuMzIgLTExNC45MzIsLTIxNS41MTQgeiIKICAgICAgICAgICBpZD0icGF0aDMwIiAvPgogICAgICAgIDxwYXRoCiAgICAgICAgICAgZmlsbD0iI2U0YTMzYSIKICAgICAgICAgICBkPSJtIDMxNzYuMTQsMzIxOC45NjQgLTMzOS43ODYsLTIxNi40MzIgMTYuMDkzLC0xMi42MDggYyAtMC45ODUsMC42MzQgLTg5LjYzMyw1NS42MzUgLTEzMy41ODksNTUuNjM1IC00My43OTIsMCAtMTY1LjI0OCwtOTAuNjg0IC0xNjYuMDE0LC05MS4zMjggbCA2OC4zNTIsNTIuMzg2IC0yNzkuMjI0LDE3NC42MiAtOTU5LjEyOCw1OTkuOTMgYyAzOC41MjYsNDEuODUxIDkwLjY5Nyw2Ny45MzggMTQ4LjI4NCw2Ny45MzggaCAyNDAzLjU0OSBjIDUzLjE2LDAgMTAxLjA4MSwtMjIuNjI5IDEzOC43MzUsLTU4LjczNSB6IgogICAgICAgICAgIGlkPSJwYXRoMzIiIC8+CiAgICAgIDwvZz4KICAgIDwvZz4KICA8L2c+Cjwvc3ZnPgo='
        },
        {
            title: 'Google Apps Script',
            description: 'Import emails directly from Gmail, using a Google Apps Script',
            callback: importFromGAScript,
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgdmVyc2lvbj0iMS4xIgogICB3aWR0aD0iNDU2LjEzOTI1IgogICBoZWlnaHQ9IjM2MC44MDg1IgogICBpZD0ic3ZnMjIiCiAgIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICAgeG1sbnM6c3ZnPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnMKICAgICBpZD0iZGVmczI2IiAvPgogIDxyZWN0CiAgICAgZmlsbD0iI2VhNDMzNSIKICAgICB4PSIwIgogICAgIHk9IjI1My41MzAzOCIKICAgICB3aWR0aD0iMzczIgogICAgIGhlaWdodD0iMTA3IgogICAgIHJ4PSI1My41IgogICAgIGlkPSJyZWN0MiIgLz4KICA8cmVjdAogICAgIGZpbGw9IiNmYmJjMDQiCiAgICAgeD0iLTQ5Mi45MDU5NCIKICAgICB5PSItMTE0LjA0NzMzIgogICAgIHdpZHRoPSIzNzMiCiAgICAgaGVpZ2h0PSIxMDciCiAgICAgcng9IjUzLjUiCiAgICAgdHJhbnNmb3JtPSJyb3RhdGUoLTE0NCkiCiAgICAgaWQ9InJlY3Q0IiAvPgogIDxyZWN0CiAgICAgZmlsbD0iIzM0YTg1MyIKICAgICB4PSI3MS4wODQ2MjUiCiAgICAgeT0iLTI2My42ODY5MiIKICAgICB3aWR0aD0iMzczIgogICAgIGhlaWdodD0iMTA3IgogICAgIHJ4PSI1My41IgogICAgIHRyYW5zZm9ybT0icm90YXRlKDcyKSIKICAgICBpZD0icmVjdDYiIC8+CiAgPHJlY3QKICAgICBmaWxsPSIjNDI4NWY0IgogICAgIHg9Ii0yNDYuMDAxMSIKICAgICB5PSIzNDUuOTQzNzMiCiAgICAgd2lkdGg9IjM3MyIKICAgICBoZWlnaHQ9IjEwNyIKICAgICByeD0iNTMuNSIKICAgICB0cmFuc2Zvcm09InJvdGF0ZSgtNzIpIgogICAgIGlkPSJyZWN0OCIgLz4KICA8ZwogICAgIGZpbGw9IiNmZmZmZmYiCiAgICAgaWQ9ImcyMCIKICAgICB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMjcuNTMwMDAxLC03NS4zNjk2MTMpIj4KICAgIDxjaXJjbGUKICAgICAgIGN4PSIyNjUuODQiCiAgICAgICBjeT0iMTI5LjI4IgogICAgICAgcj0iMjYuNzAwMDAxIgogICAgICAgaWQ9ImNpcmNsZTEwIiAvPgogICAgPGNpcmNsZQogICAgICAgY3g9IjEzMS40NCIKICAgICAgIGN5PSIyMjUuNDQiCiAgICAgICByPSIyNi43MDAwMDEiCiAgICAgICBpZD0iY2lyY2xlMTIiIC8+CiAgICA8Y2lyY2xlCiAgICAgICBjeD0iODEuMzYwMDAxIgogICAgICAgY3k9IjM4Mi42MDAwMSIKICAgICAgIHI9IjI2LjcwMDAwMSIKICAgICAgIGlkPSJjaXJjbGUxNCIgLz4KICAgIDxjaXJjbGUKICAgICAgIGN4PSIzNDguMjIiCiAgICAgICBjeT0iMzgxLjY0MDAxIgogICAgICAgcj0iMjYuNzAwMDAxIgogICAgICAgaWQ9ImNpcmNsZTE2IiAvPgogICAgPGNpcmNsZQogICAgICAgY3g9IjQzMC42NzAwMSIKICAgICAgIGN5PSIxMjcuODkiCiAgICAgICByPSIyNi43MDAwMDEiCiAgICAgICBpZD0iY2lyY2xlMTgiIC8+CiAgPC9nPgo8L3N2Zz4K'
        }
    ];

    const addImportButton = nominations => {
        if (document.getElementById('wfeiApiImportBtn') !== null) return;
        const ref = document.querySelector('wf-logo');
        const div = document.createElement('div');
        const btn = document.createElement('btn');
        btn.textContent = 'Import emails';
        btn.addEventListener('click', () => {
            const outer = document.createElement('div');
            outer.classList.add('wfeiApiImportBg');
            document.querySelector('body').appendChild(outer);
            const inner = document.createElement('div');
            inner.classList.add('wfeiApiImportInner');
            inner.classList.add('wfeiApiImportMethod');
            outer.appendChild(inner);
            const header = document.createElement('h1');
            header.textContent = 'Import Wayfarer emails';
            inner.appendChild(header);
            const sub = document.createElement('p');
            sub.textContent = 'Please select how you want to import your emails.';
            inner.appendChild(sub);

            importMethods.forEach(method => {
                const btn = document.createElement('div');
                btn.classList.add('wfeiApiMethodButton');
                if (method.icon) {
                    btn.style.paddingLeft = '60px';
                    btn.style.backgroundImage = 'url(' + method.icon + ')';
                }
                const btnTitle = document.createElement('p');
                btnTitle.classList.add('wfeiApiMethodTitle');
                btnTitle.textContent = method.title;
                btn.appendChild(btnTitle);
                const btnDesc = document.createElement('p');
                btnDesc.classList.add('wfeiApiMethodDesc');
                btnDesc.textContent = method.description;
                btn.appendChild(btnDesc);
                btn.addEventListener('click', () => {
                    outer.parentNode.removeChild(outer);
                    method.callback(nominations);
                });
                inner.appendChild(btn);
            });
        });
        btn.id = 'wfeiApiImportBtn';
        btn.classList.add('wfeiApiTopButton');
        div.appendChild(btn);
        ref.parentNode.parentNode.appendChild(div);
    };

    const storeEmails = (db, files, fileCount, progress) => new Promise(async (resolve, reject) => {
        const supportedSenders = [
            'notices@wayfarer.nianticlabs.com',
            'nominations@portals.ingress.com',
            'hello@pokemongolive.com',
            'ingress-support@google.com',
            'ingress-support@nianticlabs.com'
        ];
        let i = 0;
        const counters = {
            imported: 0,
            replaced: 0
        }
        await dispatchEmailEvent('ImportStarted');
        for await (const file of files()) {
            i++;
            progress(i, fileCount);
            const content = file.contents;
            const mime = parseMIME(content);
            if (!mime) {
                console.warn(`Error processing file {id=${file.id}, name=${file.name}}: This file does not appear to be an email in MIME format (invalid RFC 822 data).`);
                continue;
            }
            const [ headers, body ] = mime;
            const fh = {};
            for (const i of ['from', 'message-id', 'date']) {
                const matching = headers.find(e => e[0].toLowerCase() == i);
                fh[i] = matching ? matching[1] : null;
            }

            const emailAddress = extractEmail(fh.from);
            if (!supportedSenders.includes(emailAddress)) {
                console.warn(`Error processing file {id=${file.id}, name=${file.name}}: Sender "${fh.name}" was not recognized as a valid Niantic Wayfarer or OPR-related email address.`);
                continue;
            }
            if (emailAddress == "hello@pokemongolive.com" && new Date(fh.date).getUTCFullYear() <= 2018) {
                // Newsletters used this email address for some time up until late 2018, which was before this game got Wayfarer/OPR access
                continue;
            }
            const obj = {
                id: fh['message-id'],
                pids: file.id ? [ file.id ] : [],
                filename: file.name,
                ts: Date.now(),
                headers, body
            };
            await new Promise(cont => {
                const tx = db.transaction([OBJECT_STORE_NAME], "readwrite");
                const objectStore = tx.objectStore(OBJECT_STORE_NAME);
                const getExisting = objectStore.get(obj.id);
                getExisting.onsuccess = event => {
                    let wfEmail = null, evtType = null;
                    if (event.target.result) {
                        const other = event.target.result;
                        const pids = [...obj.pids, ...other.pids].filter((e, i, a) => a.indexOf(e) == i);
                        const existingHops = new WayfarerEmail(other).getHeader('Received').length;
                        const proposedHops = new WayfarerEmail(obj).getHeader('Received').length;
                        if (proposedHops < existingHops) {
                            const newObj = { ...obj, pids };
                            objectStore.put(newObj);
                            wfEmail = new WayfarerEmail(newObj);
                            evtType = 'EmailReplaced';
                            counters.replaced++;
                        } else {
                            objectStore.put({ ...other, pids });
                        }
                    } else {
                        objectStore.put(obj);
                        wfEmail = new WayfarerEmail(obj);
                        evtType = 'EmailImported';
                        counters.imported++;
                    }
                    tx.commit();
                    if (wfEmail && evtType) {
                        dispatchEmailEvent(evtType, wfEmail).then(() => cont());
                    } else {
                        cont();
                    }
                }
            });
        }
        await dispatchEmailEvent('ImportCompleted');
        resolve(counters);
    });

    class WayfarerEmail {
        #dbObject;
        #cache = {};

        constructor(dbObject) {
            this.#dbObject = dbObject;
        }

        get originatingFilename() {
            return this.#dbObject.filename;
        }

        get messageID() {
            return this.#dbObject.id;
        }

        get importedDate() {
            return new Date(this.#dbObject.ts);
        }

        getHeader(header, asList) {
            const headerList = this.#dbObject.headers.filter(e => e[0].toLowerCase() == header.toLowerCase()).map(e => e[1]);
            if (asList) return headerList;
            if (headerList.length == 0) return null;
            if (headerList.length == 1) return headerList[0];
            else return headerList;
        }

        getBody(contentType) {
            const alts = this.getMultipartAlternatives();
            return alts.hasOwnProperty(contentType.toLowerCase()) ? alts[contentType.toLowerCase()] : null;
        }

        getMultipartAlternatives() {
            const alts = {};
            const ct = this.#parseContentType(this.getHeader('Content-Type'));
            if (ct.type == 'multipart/alternative') {
                const parts = this.#dbObject.body.split(`--${ct.params.boundary}`);
                for (let i = 0; i < parts.length; i++) {
                    const partMime = parseMIME(parts[i]);
                    if (!partMime) continue;
                    const [ partHead, partBody ] = partMime;
                    if (!partBody.trim().length) continue;
                    const partCTHdr = partHead.find(e => e[0].toLowerCase() == 'content-type');
                    const partCTEHdr = partHead.find(e => e[0].toLowerCase() == 'content-transfer-encoding');

                    if (!partCTHdr) continue;
                    const partCT = this.#parseContentType(partCTHdr[1]);

                    const cte = partCTEHdr ? partCTEHdr[1].toLowerCase() : null;
                    const charset = (partCT.params.charset || 'utf-8').toLowerCase();
                    alts[partCT.type] = this.#decodeBodyUsingCTE(partBody, cte, charset);
                }
            } else {
                const cte = this.getHeader('Content-Transfer-Encoding');
                const charset = (ct.params.charset || 'utf-8').toLowerCase();
                alts[ct.type] = this.#decodeBodyUsingCTE(this.#dbObject.body, cte, charset);
            }
            return alts;
        }

        getDocument() {
            if (this.#cache.document) return this.#cache.document;
            const html = this.getBody('text/html');
            if (!html) return null;
            const dp = new DOMParser();
            this.#cache.document = dp.parseFromString(html, 'text/html');
            return this.#cache.document;
        }

        // Don't use this
        createDebugBundle() {
            return this.#dbObject;
        }

        display() {
            let emlUri = 'data:text/plain,';
            const alts = this.getMultipartAlternatives();
            for (const [k, v] of Object.entries(alts)) {
                const b = new Blob([v], { type: k });
                alts[k] = URL.createObjectURL(b);
            }
            if (alts['text/html']) emlUri = alts['text/html'];
            else if (alts['text/plain']) emlUri = alts['text/plain'];
            const doc = document.createElement('html');
            const head = document.createElement('head');
            doc.appendChild(head);
            const charsetDecl = document.createElement('meta');
            charsetDecl.setAttribute('charset', 'utf-8');
            head.appendChild(charsetDecl);
            const title = document.createElement('title');
            title.textContent = this.getHeader('Subject');
            head.appendChild(title);
            const style = document.createElement('style');
            style.textContent = `
body {
    margin: 0;
    font-family: sans-serif;
}
#outer {
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    position: absolute;
    display: flex;
    flex-flow: column;
}
#headers {
    flex: 0 1 auto;
    padding: 10px;
}
#variants span::after {
    content: ', ';
}
#variants span:last-child::after {
    content: '';
}
iframe {
    flex: 1 1 auto;
    border: none;
}
td:first-child {
    font-weight: bold;
    padding-right: 15px;
}
@media (prefers-color-scheme: dark) {
    #headers {
        background-color: #1b1b1b;
        color: #fff;
    }
    a {
        color: lightblue;
    }
}
`;
            head.appendChild(style);
            const body = document.createElement('body');
            doc.appendChild(body);
            const outer = document.createElement('div');
            outer.id = 'outer';
            body.appendChild(outer);
            const headers = document.createElement('div');
            headers.id = 'headers';
            outer.appendChild(headers);

            const table = document.createElement('table');
            headers.appendChild(table);
            for (const header of ['From', 'To', 'Subject', 'Date']) {
                const row = document.createElement('tr');
                const kcell = document.createElement('td');
                kcell.textContent = header;
                const vcell = document.createElement('td');
                vcell.textContent = this.getHeader(header);
                row.appendChild(kcell);
                row.appendChild(vcell);
                table.appendChild(row);
            }
            const row = document.createElement('tr');
            const kcell = document.createElement('td');
            kcell.textContent = 'Variants';
            const vcell = document.createElement('td');
            vcell.id = 'variants';
            for (const [k, v] of Object.entries(alts)) {
                const typeAnchor = document.createElement('a');
                typeAnchor.target = 'emailFrame';
                typeAnchor.href = v;
                typeAnchor.textContent = k;
                const typeSpan = document.createElement('span');
                typeSpan.appendChild(typeAnchor);
                vcell.appendChild(typeSpan);
            }
            row.appendChild(kcell);
            row.appendChild(vcell);
            table.appendChild(row);

            const ifr = document.createElement('iframe');
            ifr.name = 'emailFrame';
            ifr.src = emlUri;
            outer.appendChild(ifr);
            const data = '<!DOCTYPE html>\n' + doc.outerHTML;
            const b = new Blob([data], { type: 'text/html' });
            const bUrl = URL.createObjectURL(b);
            window.open(bUrl, '_blank', 'popup');
        }

        #decodeBodyUsingCTE(body, cte, charset) {
            switch (cte) {
                case null:
                    return body;
                case 'quoted-printable':
                    return unfoldQuotedPrintable(body, charset);
                case 'base64':
                    return charset.toLowerCase() == 'utf-8' ? atobUTF8(body) : atob(body);
                default:
                    throw new Error(`Unknown Content-Transfer-Encoding: ${cte}`);
            }
        }

        #parseContentType(ctHeader) {
            const m = ctHeader.match(/^(?<type>[^\/]+\/[^\/;\s]+)(?=($|(?<params>(;[^;]*)*)))/);
            const { type, params } = m.groups;
            const paramMap = {};
            if (params) params.substr(1).split(';').forEach(param => {
                const [ attr, value ] = param.trim().split('=');
                paramMap[attr.toLowerCase()] = value.startsWith('"') && value.endsWith('"') ? value.substring(1, value.length - 1) : value;
            });
            return { type: type.toLowerCase(), params: paramMap };
        }

        classify() {
            if (this.#cache.classification) return this.#cache.classification;
            const subject = this.getHeader('Subject');
            for (let i = 0; i < WayfarerEmail.#templates.length; i++) {
                const template = WayfarerEmail.#templates[i];
                if (subject.match(template.subject)) {
                    if (template.disambiguate) {
                        this.#cache.classification = template.disambiguate(this);
                        if (!this.#cache.classification) throw new Error('Disambiguation of ambiguous email template failed.');
                    } else {
                        this.#cache.classification = {
                            type: template.type,
                            style: template.style,
                            language: template.language
                        };
                    }
                    return this.#cache.classification;
                }
            }
            throw new Error('This email does not appear to match any styles of Niantic emails currently known to Email API.');
        }

        static #templates = [
            //  ---------------------------------------- MISCELLANEOUS ----------------------------------------
            {
                subject: /^Ingress Mission/,
                type: 'MISCELLANEOUS',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Ingress Damage Report:/,
                type: 'MISCELLANEOUS',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Help us improve Wayfarer$/,
                type: 'SURVEY',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Help us tackle Wayfarer Abuse$/,
                type: 'SURVEY',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Your Wayspot submission for/,
                type: 'NOMINATION_DECIDED',
                style: 'LIGHTSHIP',
                language: 'en'
            },
            {
                subject: /Activated on VPS$/,
                type: 'MISCELLANEOUS',
                style: 'LIGHTSHIP',
                language: 'en'
            },
            {
                subject: /^Re: \[\d+\] /,
                type: 'MISCELLANEOUS',
                style: null,
                language: 'en'
            },
            //  ---------------------------------------- ENGLISH [en] ----------------------------------------
            {
                subject: /^Thanks! Niantic Wayspot nomination received for/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Niantic Wayspot nomination decided for/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Decision on your? Wayfarer Nomination,/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Thanks! Niantic Wayspot appeal received for/,
                type: 'APPEAL_RECEIVED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Your Niantic Wayspot appeal has been decided for/,
                type: 'APPEAL_DECIDED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Portal submission confirmation:/,
                type: 'NOMINATION_RECEIVED',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Portal review complete:/,
                type: 'NOMINATION_DECIDED',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Ingress Portal Submitted:/,
                type: 'NOMINATION_RECEIVED',
                style: 'REDACTED',
                language: 'en'
            },
            {
                subject: /^Ingress Portal Duplicate:/,
                type: 'NOMINATION_DECIDED',
                style: 'REDACTED',
                language: 'en'
            },
            {
                subject: /^Ingress Portal Live:/,
                type: 'NOMINATION_DECIDED',
                style: 'REDACTED',
                language: 'en'
            },
            {
                subject: /^Ingress Portal Rejected:/,
                type: 'NOMINATION_DECIDED',
                style: 'REDACTED',
                language: 'en'
            },
            {
                subject: /^Trainer [^:]+: Thank You for Nominating a PokéStop for Review.$/,
                type: 'NOMINATION_RECEIVED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Trainer [^:]+: Your PokéStop Nomination Is Eligible!$/,
                type: 'NOMINATION_DECIDED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Trainer [^:]+: Your PokéStop Nomination Is Ineligible$/,
                type: 'NOMINATION_DECIDED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Trainer [^:]+: Your PokéStop Nomination Review Is Complete:/,
                type: 'NOMINATION_DECIDED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Photo Submission Received$/,
                type: 'PHOTO_RECEIVED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Photo Submission (Accepted|Rejected)$/,
                type: 'PHOTO_DECIDED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Edit Suggestion Received$/,
                type: 'EDIT_RECEIVED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Edit Suggestion (Accepted|Rejected)$/,
                type: 'EDIT_DECIDED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Invalid Pokéstop\/Gym Report Received$/,
                type: 'REPORT_RECEIVED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Invalid Pokéstop\/Gym Report (Accepted|Rejected)$/,
                type: 'REPORT_DECIDED',
                style: 'POKEMON_GO',
                language: 'en'
            },
            {
                subject: /^Thanks! Niantic Wayspot Photo received for/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Niantic Wayspot media submission decided for/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Thanks! Niantic Wayspot edit suggestion received for/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Niantic Wayspot edit suggestion decided for/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Thanks! Niantic Wayspot report received for/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Niantic Wayspot report decided for/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'en'
            },
            {
                subject: /^Portal photo submission confirmation/,
                type: 'PHOTO_RECEIVED',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Portal photo review complete/,
                type: 'PHOTO_DECIDED',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Portal Edit Suggestion Received$/,
                type: 'EDIT_RECEIVED',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Portal edit submission confirmation/,
                type: 'EDIT_RECEIVED',
                style: 'REDACTED',
                language: 'en'
            },
            {
                subject: /^Portal edit review complete/,
                type: 'EDIT_DECIDED',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Invalid Ingress Portal report received$/,
                type: 'REPORT_RECEIVED',
                style: 'INGRESS',
                language: 'en'
            },
            {
                subject: /^Invalid Ingress Portal report reviewed$/,
                type: 'REPORT_DECIDED',
                style: 'INGRESS',
                language: 'en'
            },
            //  ---------------------------------------- BENGALI [bn] ----------------------------------------
            {
                subject: /^ধন্যবাদ! .*-এর জন্য Niantic Wayspot মনোনয়ন পাওয়া গেছে!/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'bn'
            },
            {
                subject: /-এর জন্য Niantic Wayspot মনোনয়নের সিদ্ধান্ত নেওয়া হয়েছে/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'bn'
            },
            {
                subject: /^ধন্যবাদ! .*( |-)এর জন্য Niantic Wayspot Photo পাওয়া গিয়েছে!$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'bn'
            },
            {
                subject: /-এর জন্য Niantic Wayspot মিডিয়া জমা দেওয়ার সিদ্ধান্ত নেওয়া হয়েছে$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'bn'
            },
            {
                subject: /^ধন্যবাদ! .*( |-)এর জন্য Niantic Wayspot সম্পাদনা করার পরামর্শ পাওয়া গেছে!$/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'bn'
            },
            {
                subject: /-এর জন্য Niantic Wayspot সম্পাদনায় পরামর্শের সিদ্ধান্ত নেওয়া হয়েছে$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'bn'
            },
            {
                subject: /^ধন্যবাদ! .*( |-)এর জন্য Niantic Wayspot রিপোর্ট পাওয়া গেছে!$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'bn'
            },
            {
                subject: /^Niantic Wayspot রিপোর্ট .*-এর জন্য সিদ্ধান্ত নেওয়া হয়েছে$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'bn'
            },
            //  ---------------------------------------- CZECH [cs] ----------------------------------------
            {
                subject: /^Děkujeme! Přijali jsme nominaci na Niantic Wayspot pro/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Rozhodnutí o nominaci na Niantic Wayspot pro/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Děkujeme! Přijali jsme odvolání proti odmítnutí Niantic Wayspotu/,
                type: 'APPEAL_RECEIVED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Rozhodnutí o odvolání proti nominaci na Niantic Wayspot pro/,
                type: 'APPEAL_DECIDED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Děkujeme! Přijali jsme Photo pro Niantic Wayspot/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Rozhodnutí o odeslání obrázku Niantic Wayspotu/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Děkujeme! Přijali jsme návrh na úpravu Niantic Wayspotu pro/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Rozhodnutí o návrhu úpravy Niantic Wayspotu pro/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Děkujeme! Přijali jsme hlášení ohledně Niantic Wayspotu/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'cs'
            },
            {
                subject: /^Rozhodnutí o hlášení v souvislosti s Niantic Wayspotem/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'cs'
            },
            //  ---------------------------------------- GERMAN [de] ----------------------------------------
            {
                subject: /^Danke! Wir haben deinen Vorschlag für den Wayspot/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Entscheidung zum Wayspot-Vorschlag/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Danke! Wir haben deinen Einspruch für den Wayspot/,
                type: 'APPEAL_RECEIVED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Entscheidung zum Einspruch für den Wayspot/,
                type: 'APPEAL_DECIDED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Empfangsbestätigung deines eingereichten Portalvorschlags:/,
                type: 'NOMINATION_RECEIVED',
                style: 'INGRESS',
                language: 'de'
            },
            {
                subject: /^Überprüfung des Portals abgeschlossen:/,
                type: 'NOMINATION_DECIDED',
                style: 'INGRESS',
                language: 'de'
            },
            {
                subject: /^Trainer [^:]+: Danke, dass du einen PokéStop zur Überprüfung vorgeschlagen hast$/,
                type: 'NOMINATION_RECEIVED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Trainer [^:]+: Dein vorgeschlagener PokéStop ist (zulässig!|nicht zulässig)$/,
                type: 'NOMINATION_DECIDED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Trainer [^:]+: Die Prüfung deines PokéStop-Vorschlags wurde abgeschlossen:/,
                type: 'NOMINATION_DECIDED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Fotovorschlag erhalten$/,
                type: 'PHOTO_RECEIVED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Fotovorschlag (akzeptiert|abgelehnt)$/,
                type: 'PHOTO_DECIDED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Vorschlag für Bearbeitung erhalten$/,
                type: 'EDIT_RECEIVED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Vorschlag für Bearbeitung (akzeptiert|abgelehnt)$/,
                type: 'EDIT_DECIDED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Meldung zu unzulässigen PokéStop\/Arena erhalten$/,
                type: 'REPORT_RECEIVED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Meldung zu unzulässigen PokéStop\/Arena (akzeptiert|abgelehnt)$/,
                type: 'REPORT_DECIDED',
                style: 'POKEMON_GO',
                language: 'de'
            },
            {
                subject: /^Danke! Wir haben den Upload Photo für den Wayspot/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Entscheidung zu deinem Upload für den Wayspot/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Danke! Wir haben deinen Änderungsvorschlag für den Wayspot/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Entscheidung zu deinem Änderungsvorschlag für den Wayspot/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Danke! Wir haben deine Meldung für den Wayspot/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Entscheidung zu deiner Meldung für den Wayspot/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'de'
            },
            {
                subject: /^Portalfotovorschlag erhalten/,
                type: 'PHOTO_RECEIVED',
                style: 'INGRESS',
                language: 'de'
            },
            {
                subject: /^Überprüfung des Portalfotos abgeschlossen/,
                type: 'PHOTO_DECIDED',
                style: 'INGRESS',
                language: 'de'
            },
            {
                subject: /^Vorschlag für die Änderung eines Portals erhalten/,
                type: 'EDIT_RECEIVED',
                style: 'INGRESS',
                language: 'de'
            },
            {
                subject: /^Überprüfung des Vorschlags zur Änderung eines Portals abgeschlossen/,
                type: 'EDIT_DECIDED',
                style: 'INGRESS',
                language: 'de'
            },
            {
                subject: /^Meldung zu ungültigem Ingress-Portal erhalten$/,
                type: 'REPORT_RECEIVED',
                style: 'INGRESS',
                language: 'de'
            },
            {
                subject: /^Meldung zu ungültigem Ingress-Portal geprüft$/,
                type: 'REPORT_DECIDED',
                style: 'INGRESS',
                language: 'de'
            },
            //  ---------------------------------------- SPANISH [es] ----------------------------------------
            {
                subject: /^¡Gracias! ¡Hemos recibido la propuesta de Wayspot de Niantic/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^Decisión tomada sobre la propuesta de Wayspot de Niantic/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^¡Gracias! ¡Recurso de Wayspot de Niantic recibido para/,
                type: 'APPEAL_RECEIVED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^¡Gracias! ¡Hemos recibido el Photo del Wayspot de Niantic para/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^Decisión tomada sobre el envío de archivo de Wayspot de Niantic para/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^¡Gracias! ¡Propuesta de modificación de Wayspot de Niantic recibida para/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^Decisión tomada sobre la propuesta de modificación del Wayspot de Niantic/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^¡Gracias! ¡Hemos recibido el informe sobre el Wayspot de Niantic/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'es'
            },
            {
                subject: /^Decisión tomada sobre el Wayspot de Niantic/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'es'
            },
            //  ---------------------------------------- FRENCH [fr] ----------------------------------------
            {
                subject: /^Remerciements ! Proposition d’un Wayspot Niantic reçue pour/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'fr'
            },
            {
                subject: /^Résultat concernant la proposition du Wayspot Niantic/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'fr'
            },
            {
                subject: /^Remerciements ! Contribution de Wayspot Niantic Photo reçue pour/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'fr'
            },
            {
                subject: /^Résultat concernant le Wayspot Niantic/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'fr'
            },
            {
                subject: /^Remerciements ! Proposition de modification de Wayspot Niantic reçue pour/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'fr'
            },
            {
                subject: /^Résultat concernant la modification du Wayspot Niantic/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'fr'
            },
            {
                subject: /^Remerciements ! Signalement reçu pour le Wayspot/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'fr'
            },
            {
                subject: /^Résultat concernant le signalement du Wayspot Niantic/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'fr'
            },
            //  ---------------------------------------- HINDI [hi] ----------------------------------------
            {
                subject: /^धन्यवाद! .* के लिए Niantic Wayspot नामांकन प्राप्त हुआ!$/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'hi'
            },
            {
                subject: /^Niantic Wayspot का नामांकन .* के लिए तय किया गया$/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'hi'
            },
            {
                subject: /के लिए तह Niantic Wayspot मीडिया सबमिशन$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'hi'
            },
            {
                subject: /^धन्यवाद! .* के लिए Niantic Wayspot Photo प्राप्त हुआ!$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'hi',
            },
            {
                subject: /^धन्यवाद! .* के लिए Niantic Wayspot संपादन सुझाव प्राप्त हुआ!$/,
                disambiguate: email => {
                    const doc = email.getDocument();
                    const title = doc.querySelector('td.em_pbottom.em_blue.em_font_20').textContent.trim();
                    if (title == 'बढ़िया खोज की! आपके वेस्पॉट Photo सबमिशन के लिए धन्यवाद!') {
                        return {
                            type: 'PHOTO_RECEIVED',
                            style: 'WAYFARER',
                            language: 'hi',
                        }
                    } else if (title.includes('आपके संपादन हमारे खोजकर्ताओं के समुदाय के लिए सर्वोत्तम संभव अनुभव बनाए रखने में मदद करते हैं।')) {
                        return {
                            type: 'EDIT_RECEIVED',
                            style: 'WAYFARER',
                            language: 'hi',
                        }
                    } else {
                        return null;
                    }
                }
            },
            {
                subject: /के लिए Niantic Wayspot संपादन सुझाव प्राप्त हुआ$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'hi'
            },
            {
                subject: /^धन्यवाद! .* के लिए प्राप्त Niantic Wayspot रिपोर्ट!$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'hi'
            },
            {
                subject: /के लिए तय Niantic Wayspot रिपोर्ट$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'hi'
            },
            //  ---------------------------------------- ITALIAN [it] ----------------------------------------
            {
                subject: /^Grazie! Abbiamo ricevuto una candidatura di Niantic Wayspot per/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'it'
            },
            {
                subject: /^Proposta di Niantic Wayspot decisa per/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'it'
            },
            {
                subject: /^Grazie! Abbiamo ricevuto Photo di Niantic Wayspot per/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'it'
            },
            {
                subject: /^Proposta di contenuti multimediali di Niantic Wayspot decisa per/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'it'
            },
            {
                subject: /^Grazie! Abbiamo ricevuto il suggerimento di modifica di Niantic Wayspot per/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'it'
            },
            {
                subject: /^Suggerimento di modifica di Niantic Wayspot deciso per/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'it'
            },
            {
                subject: /^Grazie! Abbiamo ricevuto la segnalazione di Niantic Wayspot per/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'it'
            },
            {
                subject: /^Segnalazione di Niantic Wayspot decisa per/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'it'
            },
            //  ---------------------------------------- JAPANESE [ja] ----------------------------------------
            {
                subject: /^ありがとうございます。 Niantic Wayspotの申請「.*」が受領されました。$/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^Niantic Wayspotの申請「.*」が決定しました。$/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^ありがとうございます。 Niantic Wayspotに関する申し立て「.*」が受領されました。$/,
                type: 'APPEAL_RECEIVED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^Niantic Wayspot「.*」に関する申し立てが決定しました。$/,
                type: 'APPEAL_DECIDED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^ありがとうございます。 Niantic Wayspot Photo「.*」が受領されました。$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^Niantic Wayspotのメディア申請「.*」が決定しました。$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^ありがとうございます。 Niantic Wayspot「.*」の編集提案が受領されました。$/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^Niantic Wayspotの編集提案「.*」が決定しました。$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^ありがとうございます。 Niantic Wayspotに関する報告「.*」が受領されました。$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'ja'
            },
            {
                subject: /^Niantic Wayspotの報告「.*」が決定しました$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'ja'
            },
            //  ---------------------------------------- KOREAN [ko] ----------------------------------------
            {
                subject: /^감사합니다! .*에 대한 Niantic Wayspot 후보 신청이 완료되었습니다!$/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'ko'
            },
            {
                subject: /에 대한 Niantic Wayspot 후보 결정이 완료됨$/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'ko'
            },
            {
                subject: /^감사합니다! .*에 대한 Niantic Wayspot Photo 제출 완료$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'ko'
            },
            {
                subject: /에 대한 Niantic Wayspot 미디어 제안 결정 완료$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'ko'
            },
            {
                subject: /^감사합니다! .*에 대한 Niantic Wayspot 수정이 제안되었습니다!$/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'ko'
            },
            {
                subject: /에 대한 Niantic Wayspot 수정 제안 결정 완료$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'ko'
            },
            {
                subject: /^감사합니다! .*에 대한 Niantic Wayspot 보고 접수$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'ko'
            },
            {
                subject: /에 대한 Niantic Wayspot 보고 결정 완료$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'ko'
            },
            //  ---------------------------------------- MARATHI [mr] ----------------------------------------
            {
                subject: /^धन्यवाद! Niantic वेस्पॉट नामांकन .* साठी प्राप्त झाले!$/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /^Niantic वेस्पॉट नामांकन .* साठी निश्चित केले$/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /^धन्यवाद! Niantic वेस्पॉट आवाहन .* साठी प्राप्त झाले!$/,
                type: 'APPEAL_RECEIVED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /^तुमचे Niantic वेस्पॉट आवाहन .* साठी निश्चित करण्यात आले आहे$/,
                type: 'APPEAL_DECIDED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /^धन्यवाद! .* साठी Niantic वेस्पॉट Photo प्राप्त झाले!$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /साठी Niantic वेस्पॉट मीडिया सबमिशनचा निर्णय घेतला$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /^धन्यवाद! Niantic वेस्पॉट संपादन सूचना .* साठी प्राप्त झाली!$/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /^Niantic वेस्पॉट संपादन सूचना .* साठी निश्चित केली$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /^धन्यवाद! .* साठी Niantic वेस्पॉट अहवाल प्राप्त झाला!$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'mr'
            },
            {
                subject: /साठी Niantic वेस्पॉट अहवाल निश्चित केला$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'mr'
            },
            //  ---------------------------------------- DUTCH [nl] ----------------------------------------
            {
                subject: /^Bedankt! Niantic Wayspot-nominatie ontvangen voor/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'nl'
            },
            {
                subject: /^Besluit over Niantic Wayspot-nominatie voor/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'nl'
            },
            {
                subject: /^Bedankt! Niantic Wayspot-Photo ontvangen voor/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'nl'
            },
            {
                subject: /^Besluit over Niantic Wayspot-media-inzending voor/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'nl'
            },
            {
                subject: /^Bedankt! Niantic Wayspot-bewerksuggestie ontvangen voor/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'nl'
            },
            {
                subject: /^Besluit over Niantic Wayspot-bewerksuggestie voor/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'nl'
            },
            {
                subject: /^Bedankt! Melding van Niantic Wayspot .* ontvangen!$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'nl'
            },
            {
                subject: /^Besluit over Niantic Wayspot-melding voor/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'nl'
            },
            //  ---------------------------------------- NORWEGIAN [no] ----------------------------------------
            {
                subject: /^Takk! Vi har mottatt Niantic Wayspot-nominasjonen for/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^En avgjørelse er tatt for Niantic Wayspot-nominasjonen for/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^Takk! Vi har mottatt Niantic Wayspot-klagen for/,
                type: 'APPEAL_RECEIVED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^En avgjørelse er tatt for Niantic Wayspot-klagen for/,
                type: 'APPEAL_DECIDED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^Takk! Vi har mottatt Photo for Niantic-Wayspot-en/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^Takk! Vi har mottatt endringsforslaget for Niantic Wayspot-en/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^Takk! Vi har mottatt Niantic Wayspot-rapporten for/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^En avgjørelse er tatt for Niantic Wayspot-medieinnholdet som er sendt inn for/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^En avgjørelse er tatt for endringsforslaget for Niantic Wayspot-en/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'no'
            },
            {
                subject: /^En avgjørelse er tatt for Niantic Wayspot-rapporten for/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'no'
            },
            //  ---------------------------------------- POLISH [pl] ----------------------------------------
            {
                subject: /^Dziękujemy! Odebrano nominację Wayspotu/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'pl'
            },
            {
                subject: /^Podjęto decyzję na temat nominacji Wayspotu/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'pl'
            },
            {
                subject: /^Dziękujemy! Odebrano materiały Photo Wayspotu Niantic/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'pl'
            },
            {
                subject: /^Decyzja na temat zgłoszenia materiałów do Wayspotu Niantic/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'pl'
            },
            {
                subject: /^Dziękujemy! Odebrano sugestię zmiany Wayspotu Niantic/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'pl'
            },
            {
                subject: /^Podjęto decyzję na temat sugestii edycji Wayspotu Niantic/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'pl'
            },
            {
                subject: /^Dziękujemy! Odebrano raport dotyczący Wayspotu Niantic/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'pl'
            },
            {
                subject: /^Podjęto decyzję odnośnie raportu dotyczącego Wayspotu Niantic/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'pl'
            },
            //  ---------------------------------------- PORTUGUESE [pt] ----------------------------------------
            {
                subject: /^Agradecemos a sua indicação para o Niantic Wayspot/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'pt'
            },
            {
                subject: /^Decisão sobre a indicação do Niantic Wayspot/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'pt'
            },
            {
                subject: /^Agradecemos o envio de Photo para o Niantic Wayspot/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'pt'
            },
            {
                subject: /^Decisão sobre o envio de mídia para o Niantic Wayspot/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'pt'
            },
            {
                subject: /^Agradecemos a sua sugestão de edição para o Niantic Wayspot/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'pt'
            },
            {
                subject: /^Decisão sobre a sugestão de edição do Niantic Wayspot/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'pt'
            },
            {
                subject: /^Agradecemos o envio da denúncia referente ao Niantic Wayspot/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'pt'
            },
            {
                subject: /^Decisão sobre a denúncia referente ao Niantic Wayspot/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'pt'
            },
            //  ---------------------------------------- RUSSIAN [ru] ----------------------------------------
            {
                subject: /^Спасибо! Номинация Niantic Wayspot для .* получена!$/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'ru'
            },
            {
                subject: /^Вынесено решение по номинации Niantic Wayspot для/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'ru'
            },
            {
                subject: /^Спасибо! Получено: Photo Niantic Wayspot для/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'ru'
            },
            {
                subject: /^Вынесено решение по предложению по файлу для/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'ru'
            },
            {
                subject: /^Спасибо! Предложение по изменению Niantic Wayspot для/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'ru'
            },
            {
                subject: /^Вынесено решение по предложению по изменению Niantic Wayspot для/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'ru'
            },
            {
                subject: /^Спасибо! Жалоба на Niantic Wayspot для/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'ru'
            },
            {
                subject: /^Вынесено решение по жалобе на Niantic Wayspot для/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'ru'
            },
            //  ---------------------------------------- SWEDISH [sv] ----------------------------------------
            {
                subject: /^Tack! Niantic Wayspot-nominering har tagits emot för/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Niantic Wayspot-nominering har beslutats om för/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Din Niantic Wayspot-överklagan har beslutats om för/,
                type: 'APPEAL_DECIDED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Tack! Niantic Wayspot Photo togs emot för/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Niantic Wayspot-medieinlämning har beslutats om för/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Tack! Niantic Wayspot-redigeringsförslag har tagits emot för/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Niantic Wayspot-redigeringsförslag har beslutats om för/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Tack! Niantic Wayspot-rapport har tagits emot för/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'sv'
            },
            {
                subject: /^Niantic Wayspot-rapport har beslutats om för/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'sv'
            },
            //  ---------------------------------------- TAMIL [ta] ----------------------------------------
            {
                subject: /^நன்றி! .* -க்கான Niantic Wayspot பரிந்துரை பெறப்பட்டது!!$/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'ta'
            },
            {
                subject: /-க்கான Niantic Wayspot பணிந்துரை பரிசீலிக்கப்பட்டது.$/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'ta'
            },
            {
                subject: /^நன்றி! .* -க்கான Niantic Wayspot Photo பெறப்பட்டது!$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'ta'
            },
            {
                subject: /-க்கான Niantic Wayspot மீடியா சமர்ப்பிப்பு பரிசீலிக்கப்பட்டது.$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'ta'
            },
            {
                subject: /^நன்றி! .* -க்கான Niantic Wayspot திருத்த பரிந்துரை பெறப்பட்டது!$/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'ta'
            },
            {
                subject: /-க்கான Niantic Wayspot திருத்த பரிந்துரை பரிசீலிக்கப்பட்டது$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'ta'
            },
            {
                subject: /^நன்றி! .* -க்கான Niantic Wayspot புகார் பெறப்பட்டது!$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'ta'
            },
            {
                subject: /-க்கான Niantic Wayspot புகார் பரிசீலிக்கப்பட்டது!$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'ta'
            },
            //  ---------------------------------------- TELUGU [te] ----------------------------------------
            {
                subject: /^ధన్యవాదాలు! .* కు Niantic Wayspot నామినేషన్ అందుకున్నాము!$/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'te'
            },
            {
                subject: /కొరకు Niantic వేస్పాట్ నామినేషన్‌‌పై నిర్ణయం$/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'te'
            },
            {
                subject: /^ధన్యవాదాలు! .* కొరకు Niantic Wayspot Photo అందుకున్నాము!$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'te'
            },
            {
                subject: /కొరకు Niantic వేస్పాట్ మీడియా సమర్పణపై నిర్ణయం$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'te'
            },
            {
                subject: /^ధన్యవాదాలు! మీ వేస్పాట్ .* ఎడిట్ సూచనకై ధన్యవాదాలు!$/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'te'
            },
            {
                subject: /కొరకు నిర్ణయించబడిన Niantic వేస్పాట్ సూచన$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'te'
            },
            {
                subject: /^ధన్యవాదాలు! .* కొరకు Niantic వేస్పాట్ నామినేషన్ అందుకున్నాము!$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'te'
            },
            {
                subject: /కొరకు నిర్ణయించబడిన Niantic వేస్పాట్ రిపోర్ట్$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'te'
            },
            //  ---------------------------------------- THAI [th] ----------------------------------------
            {
                subject: /^ขอบคุณ! เราได้รับการเสนอสถานที่ Niantic Wayspot สำหรับ/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'th'
            },
            {
                subject: /^ผลการตัดสินการเสนอสถานที่ Niantic Wayspot สำหรับ/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'th'
            },
            {
                subject: /^ขอบคุณ! ได้รับ Niantic Wayspot Photo สำหรับ/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'th'
            },
            {
                subject: /^ผลการตัดสินการส่งมีเดีย Niantic Wayspot สำหรับ/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'th'
            },
            {
                subject: /^ขอบคุณ! เราได้รับคำแนะนำการแก้ไข Niantic Wayspot สำหรับ/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'th'
            },
            {
                subject: /^ผลการตัดสินคำแนะนำการแก้ไข Niantic Wayspot สำหรับ/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'th'
            },
            {
                subject: /^ขอบคุณ! เราได้รับการรายงาน Niantic Wayspot สำหรับ/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'th'
            },
            {
                subject: /^ผลตัดสินการรายงาน Niantic Wayspot สำหรับ/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'th'
            },
            //  ---------------------------------------- CHINESE [zh] ----------------------------------------
            {
                subject: /^感謝你！ 我們已收到 Niantic Wayspot 候選/,
                type: 'NOMINATION_RECEIVED',
                style: 'WAYFARER',
                language: 'zh'
            },
            {
                subject: /^社群已對 Niantic Wayspot 候選 .* 做出決定$/,
                type: 'NOMINATION_DECIDED',
                style: 'WAYFARER',
                language: 'zh'
            },
            {
                subject: /^感謝你！ 我們已收到 .* 的 Niantic Wayspot Photo！$/,
                type: 'PHOTO_RECEIVED',
                style: 'WAYFARER',
                language: 'zh'
            },
            {
                subject: /^社群已對你為 .* 提交的 Niantic Wayspot 媒體做出決定$/,
                type: 'PHOTO_DECIDED',
                style: 'WAYFARER',
                language: 'zh'
            },
            {
                subject: /^感謝你！ 我們已收到 .* 的 Niantic Wayspot 編輯建議！$/,
                type: 'EDIT_RECEIVED',
                style: 'WAYFARER',
                language: 'zh'
            },
            {
                subject: /^社群已對 .* 的 Niantic Wayspot 編輯建議做出決定$/,
                type: 'EDIT_DECIDED',
                style: 'WAYFARER',
                language: 'zh'
            },
            {
                subject: /^感謝你！ 我們已收到 .* 的 Niantic Wayspot 報告！$/,
                type: 'REPORT_RECEIVED',
                style: 'WAYFARER',
                language: 'zh'
            },
            {
                subject: /^Niantic 已對 .* 的 Wayspot 報告做出決定$/,
                type: 'REPORT_DECIDED',
                style: 'WAYFARER',
                language: 'zh'
            },
        ];
    }

    const parseMIME = data => {
        const bound = data.indexOf('\r\n\r\n');
        if (bound < 0) return null;
        const headers = data.substr(0, bound)
            .replaceAll(/\r\n\s/g, ' ')
            .split(/\r\n/).map(e => {
                const b = e.indexOf(':');
                const token = e.substr(0, b);
                // Decode RFC 2047 atoms
                const field = e.substr(b + 1).trim().replaceAll(/=\?([A-Za-z0-9-]+)\?([QqBb])\?([^\?]+)\?=(?:\s+(?==\?[A-Za-z0-9-]+\?[QqBb]\?[^\?]+\?=))?/g, (_, charset, encoding, text) => {
                    switch (encoding) {
                        case 'Q': case 'q': return new TextDecoder(charset).decode(qpStringToU8A(text.split('_').join(' ')))
                        case 'B': case 'b': return charset.toLowerCase() == 'utf-8' ? atobUTF8(text) : atob(text);
                        default: throw new Error(`Invalid RFC 2047 encoding format: ${encoding}`);
                    }
                });
                return [ token, field.trim() ];
            });
        const body = data.substr(bound + 4);
        return [ headers, body ];
    };

    const qpStringToU8A = str => {
        const u8a = new Uint8Array(str.length - (2 * (str.split('=').length - 1)));
        for (let i = 0, j = 0; i < str.length; i++, j++) {
            if (str[i] !== '=') {
                u8a[j] = str.codePointAt(i);
            } else {
                u8a[j] = parseInt(str.substring(i+1, i+3), 16);
                i += 2;
            }
        }
        return u8a;
    }

    const unfoldQuotedPrintable = (body, charset) => {
        // Unfold QP CTE
        const textDecoder = new TextDecoder(charset);
        return body
        .split(/=\r?\n/).join('')
        .split(/\r?\n/).map(e => {
            return textDecoder.decode(qpStringToU8A(e));
        }).join('\n');
    };

    const extractEmail = fromHeader => {
        const sb = fromHeader.lastIndexOf('<');
        const eb = fromHeader.lastIndexOf('>');
        if (sb < 0 && eb < 0) return fromHeader;
        else return fromHeader.substr(sb + 1, eb - sb - 1);
    }

    // https://stackoverflow.com/a/30106551/1955334
    const atobUTF8 = text => decodeURIComponent(atob(text).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));

    const utcDateToISO8601 = date => `${date.getUTCFullYear()}-${('0' + (date.getUTCMonth() + 1)).slice(-2)}-${('0' + date.getUTCDate()).slice(-2)}`;
    const shiftDays = (date, offset) => {
        const nd = new Date(date);
        nd.setUTCDate(nd.getUTCDate() + offset);
        return nd;
    }

    const userManualGAS =
`<!DOCTYPE html>
<html>
<head>
<title>GAS Setup Guide</title>
<style>
* {
font-family: sans-serif;
}
code, textarea {
font-family: monospace;
}
img {
box-shadow: 0 0 10px black;
}
body {
background: #ccc;
}
#content {
max-width: 800px;
margin: auto;
padding: 0 30px 30px 30px;
border: 1px solid black;
background: #fff;
}
img {
max-width: 100%;
}
textarea {
width: 100%;
height: 100px;
}
</style>
</head>
<body><div id="content">
<h1>Email Importer: GAS Setup Guide</h1>
<p>This user manual will explain how to set up semi-automatic email imports from Gmail using Google Apps Script. If you have previously set up the Wayfarer Planner addon, the steps are similar.</p>
<p>Note: The layout of the Google Apps Script website is subject to change. Please reach out to the developer of the script if you are unsure how to proceed with the setup, or if the guide below is no longer accurate.</p>
<h2>Step 1: Create a Google Apps Script project</h2>
<p><a href="https://script.google.com/home" target="_blank">Click here</a> to open Google Apps Script. Sign in to your Google account, if you aren't already.</p>
<p>Click on the "New Project" button in the top left corner:</p>
<img src="https://i.imgur.com/a8CicNr.png">
<p>The new project will look like this:</p>
<img src="https://i.imgur.com/98mlmxj.png">
<p>Click on "Untitled project" at the top, and give it a name so that you can easily recognize it later. I suggest "Wayfarer Email Importer".</p>
<hr>
<h2>Step 2: Copy and paste the importer code</h2>
<p>Copy the current Importer Script source code below:</p>
<textarea readonly>function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("accessToken")) props.setProperty("accessToken", randomBase64(128));
  console.log(
    "Script configured!\\n\\nTHIS IS YOUR ACCESS TOKEN:\\n"
    + props.getProperty("accessToken")
    + "\\n\\nKeep it secret, and never share it with anyone else.");
}

function resetScriptData() {
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();
  console.log("Script data successfully reset. Please remember to regenerate an access token by running setup.");
}

function randomBase64(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter &lt; length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

function doPost(e) {
  const req = JSON.parse(e.postData.contents);
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("accessToken");
  const output = { version: 1 };

  if (!token || req.token !== token) {
    output.status = "ERROR";
    output.result = "unauthorized";
  } else {
    let callback = null;
    switch (req.request) {
      case "list": callback = findEmails; break;
      case "fetch": callback = getEmails; break;
      case "test": callback = validate; break;
    }
    if (callback) {
      output.status = "OK";
      output.result = callback(req.options);
    } else {
      output.status = "ERROR";
      output.result = "unknown_route";
    }
  }
  var contentSvc = ContentService.createTextOutput(JSON.stringify(output));
  contentSvc.setMimeType(ContentService.MimeType.JSON);
  return contentSvc;
}

function findEmails({ since, offset, size }) {
  const senders = [
    "hello@pokemongolive.com",
    "nominations@portals.ingress.com",
    "notices@wayfarer.nianticlabs.com",
    "ingress-support@nianticlabs.com",
    "ingress-support@google.com"
  ].map(e => "from:" + e);
  if (since == "") since = "1970-01-01";
  if (!since.match(/^\\d{4}-\\d{2}-\\d{2}$/)) return [];
  const emails = [];
  const threads = GmailApp.search("(" + senders.join(" | ") + ") after:" + since, offset, size);
  for (j = 0; j &lt; threads.length; j++) emails.push(threads[j].getId());
  return emails;
}

function getEmails({ ids }) {
  const emls = {};
  for (let i = 0; i &lt; ids.length; i++) {
    emls[ids[i]] = GmailApp.getThreadById(ids[i]).getMessages()[0].getRawContent();
  }
  return emls;
}

function validate() {
  return "success";
}</textarea>
<p>The Google Apps Script page has a large text area that currently contains <code>function myFunction()</code> and some brackets. Select all of this text, delete it, and press <code>Ctrl+V</code> to replace it with the code you just copied above.</p>
<p>Then save the file by pressing <code>Ctrl+S</code>.</p>
<hr>
<h2>Step 3: Limit the script's permissions</h2>
<p>By default, the script you have pasted will try to get full read and write access to your Gmail account. This level of permission is not necessary, and for the safety of your account, it is recommended that you limit the permissions of the script so that it cannot write or delete emails. This step is <u>optional</u>, but it is <u>highly recommended</u>.</p>
<p>Click on the cog wheel icon (1) to access project settings, then ensure that "Show appsscript.json manifest file" is <u>checked</u>, like in this picture:</p>
<img src="https://i.imgur.com/Q7h200M.png">
<p>Next, return to the script editor by pressing the "Editor" button (1), and click on the new "appsscript.json" file that appears in the file list (2):</p>
<img src="https://i.imgur.com/eB5hred.png">
<p>Copy the correct manifest contents from below:</p>
<textarea readonly>{
  "timeZone": "Etc/UTC",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.readonly"
  ]
}</textarea>
<p>Then, overwrite the contents of the file by deleting all the contents, then pressing <code>Ctrl+V</code> to paste the contents you just copied. Save the file using <code>Ctrl+S</code>.</p>
<hr>
<h2>Step 4: Authorizing the script to access emails</h2>
<p>Return to the "Code.gs" file (1). In the function dropdown, ensure "setup" is selected (2), then press "Run" (3):</p>
<img src="https://i.imgur.com/VFx9Wgs.png">
<p>You will see an authorization prompt, like the screenshot below. Click on "Review permissions" when it appears.</p>
<img src="https://i.imgur.com/sReSttx.png">
<p>A popup will appear. Click on "Advanced" (1), then "Go to Wayfarer Email Importer (unsafe)" (or the name of your script) (2). This warning screen shows because the script used by the email importer has not been verified by Google. It is completely safe to use - the source code of the script is what you just pasted earlier.</p>
<img src="https://i.imgur.com/3wSTjPy.png">
<p>The following screen will then appear, asking permission to view your emails. Click on Allow.</p>
<img src="https://i.imgur.com/QHiZLc4.png">
<hr>
<h2>Step 5: Copy the access token</h2>
<p>You will be returned to the main Apps Script window, where a new "Execution log" will appear. After a few seconds, an access token will appear in this pane.</p>
<img src="https://i.imgur.com/WUAMGLR.png">
<p>Copy this value, and paste it in the "Access token" box that you are asked for on the "Import using Google Apps Script" window on Wayfarer.</p>
<p><b>It is very important that you do not share this token with <u>anyone</u>. Keep it completely secret.</b></p>
<p>P.S. The input box for the access token will hide its contents to prevent accidental leakage through screenshots. If you ever need it again, for example on another device, you can return to the Google Apps Script and click "Run" using the "setup" function again. If your token is ever accidentally disclosed, you can reset it by running the "resetScriptData" function, and the "setup" again to generate a new token.</p>
<hr>
<h2>Step 6: Deploy the script</h2>
<p>In the top right corner of the Google Apps Script page, there is a blue "Deploy" button. Click on it, and then click "New deployment".</p>
<img src="https://i.imgur.com/WNiIMwf.png">
<p>In the window that appears, click the gear icon, then select "Web app".</p>
<img src="https://i.imgur.com/tmvBq3E.png">
<p>Some settings will appear. Leave "Execute as" set to "Me", but make sure that "Who has access" is set to "Anyone" (1). Then, click "Deploy" (2).</p>
<img src="https://i.imgur.com/a8LPFaM.png">
<p>When the deployment has completed, you will be shown a web app URL. Copy this URL, and paste it into the "Script URL" box in the "Import using Google Apps Script" window on Wayfarer.</p>
<img src="https://i.imgur.com/2ydKg9H.png">
<hr>
<h2>Step 7: First import</h2>
<p>Congratulations, the setup is now complete! Here are a few things to keep in mind that specifically apply to the <u>first time</u> you use the importer:</p>
<ul>
<li>The first time you import emails, the process can take a very long time, as it has to import all of your emails. This can take many minutes.</li>
<li>If you have previously and recently used the manual *.eml file importer function, you may not have any changes detected. It is very important that even if you have no changes detected, you click on "Import 0 change(s)" this time, because this will mark all the emails you just imported as processed, so that it does not have to process every single one of them again the next time you run the importer.</li>
</ul>
</div></body>
</html>
`;

    (() => {
        if (localStorage.hasOwnProperty('wfnshGAScriptSettings')) {
            const gass = JSON.parse(localStorage.wfnshGAScriptSettings)
            delete gass.since
            localStorage.wfeiApiGAScriptSettings = JSON.stringify(gass);
            localStorage.removeItem('wfnshGAScriptSettings');
        }
    })();

    (() => {
        const css = `
            .wfeiApiTopButton {
                background-color: #e5e5e5;
                border: none;
                color: #ff4713;
                padding: 10px 10px;
                margin: 10px;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
                cursor: pointer;
            }
            .wfeiApiMethodButton {
                background-color: #e5e5e5;
                border: none;
                padding: 10px 10px;
                cursor: pointer;
                width: 100%;
                background-size: 30px;
                background-position: 15px;
                background-repeat: no-repeat;
                margin-bottom: 10px;
            }
            .wfeiApiMethodButton .wfeiApiMethodTitle {
                color: #ff4713;
                font-size: 16px;
            }
            .wfeiApiMethodButton .wfeiApiMethodDesc {
                font-size: 12px;
            }
            .wfeiApiCancelButton {
                color: #000000;
            }
            .wfeiApiGAScriptTable {
                width: 100%;
            }
            .wfeiApiGAScriptTable td {
                border: none;
            }
            .wfeiApiGAScriptTable input {
                background-color: #ddd;
                width: 100%;
                padding: 5px;
            }
            .dark .wfeiApiGAScriptTable input {
                background-color: #222;
            }

            .dark .wfeiApiTopButton {
                background-color: #404040;
                color: #20B8E3;
            }
            .dark .wfeiApiCancelButton {
                color: #ff0000;
            }
            .dark .wfeiApiMethodButton {
                background-color: #404040;
            }
            .dark .wfeiApiMethodButton .wfeiApiMethodTitle {
                color: #20B8E3;
            }

            .wfeiApiImportBg {
                position: fixed;
                top: 0;
                left: 0;
                height: 100vh;
                width: 100vw;
                background-color: rgba(0,0,0,0.5);
                z-index: 100000;
            }
            .wfeiApiImportInner {
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
                max-height: 500px;
            }
            .wfeiApiImportMethod {
                max-width: 500px;
                height: initial;
            }
            .wfeiApiImportGAScriptOptions {
                max-width: 700px;
                height: initial;
            }
            .dark .wfeiApiImportInner {
                background-color: #333;
            }
            .wfeiApiImportInner h3 {
                font-weight: bold;
                margin: 10px auto;
            }
            .wfeiApiImportInner > p {
                margin: 10px auto;
            }
            .wfeiApiImportLoading {
                text-align: center;
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translateX(-50%) translateY(-50%);
                padding: 20px;
                background-color: #fff;
            }
            .dark .wfeiApiImportLoading {
                background-color: #333;
            }
            .wfeiApiImportLoading h2 {
                margin-bottom: 10px;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        // We're loading this script on document-start, which means <head> does not exist yet.
        // Wait for it to start existing before we try to add the CSS to it.
        const tryAdd = setInterval(() => {
            const head = document.querySelector('head');
            if (head) {
                clearInterval(tryAdd);
                console.log('Injecting styles...');
                head.appendChild(style);
            }
        }, 100);
    })();
})();
