// ==UserScript==
// @name         Wayfarer Review Map Mods
// @version      0.9.0
// @description  Add Map Mods to Wayfarer Review Page
// @namespace    https://github.com/tehstone/wayfarer-addons
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-map-mods.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons
// @match        https://wayfarer.nianticlabs.com/*
// @run-at       document-start
// ==/UserScript==

// Copyright 2023 tehstone, bilde
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

function init() {
    let candidate;
    let map;
    let mapCtx;
    let overlay;
    let closeCircle;
    let moveCircle;
    let cellShade;
    let userHash = 0;

    let pano = null;
    let listenSVFocus = false;

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
    (function(open) {
        XMLHttpRequest.prototype.open = function(method, url) {
            if (url == "/api/v1/vault/review" && method == "GET") {
                this.addEventListener('load', parseCandidate, false);
            } else if (url == "/api/v1/vault/review" && method == "POST") {
                if (pano) {
                    // Street View panorama must be unloaded to avoid it remaining alive in the background
                    // after each review is submitted. The additional photospheres pile up in browser memory
                    // and either slow down the browser, or crash the tab entirely. This was the root cause
                    // behind why reviews would slow down and eventually crash Firefox before Street View was
                    // removed by default in Wayfarer 5.2.
                    pano.setVisible(false);
                    pano = null;
                }
            } else if (url == '/api/v1/vault/properties' && method == 'GET') {
                this.addEventListener('load', parseProps, false);
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    document.addEventListener('focusin', (e) => {
        // Prevent scroll to Street View on load (if applicable)
        if (listenSVFocus && document.activeElement.classList.contains('mapsConsumerUiSceneInternalCoreScene__root')) {
            listenSVFocus = false;
            document.querySelector('mat-sidenav-content').scrollTo(0, 0);
        }
    });

    function parseProps(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) return;
            if (json.captcha) return;
            const props = json.result;
            if (props) {
                // Get a user ID to properly handle browsers shared between several users. Store a hash only, for privacy.
                userHash = cyrb53(props.socialProfile.email);
                migrateProps();
            }
        } catch (e) {
            console.warn(e); // eslint-disable-line no-console
        }
    }

    function parseCandidate(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                console.warn('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha) {
                return;
            }

            candidate = json.result;
            if (!candidate) {
                console.warn('Wayfarer\'s response didn\'t include a candidate.');
                return;
            }
            addCss();
            checkPageType();

        } catch (e) {
            console.log(e); // eslint-disable-line no-console
        }
    }

    function checkPageType() {
        awaitElement(() =>
                document.getElementById('appropriate-card') ||
                document.querySelector('app-review-edit'))
            .then((ref) => {
                addMapMods();
                addSettings();
            })
    };

    function addMapMods() {
        console.log("addMapMods");
        if (typeof(google) === 'undefined') {
            setTimeout(addMapMods, 200);
            return;
        }
        let gmap;
        awaitElement(() =>
                document.querySelector('#check-duplicates-card nia-map') ||
                document.querySelector("app-select-location-edit"))
            .then((ref) => {
                gmap = ref;
                if (gmap === document.querySelector("app-select-location-edit")) {
                    mapCtx = gmap.__ngContext__[gmap.__ngContext__.length - 1].niaMap;
                    map = mapCtx.componentRef.map;
                } else {
                    mapCtx = gmap.__ngContext__[gmap.__ngContext__.length - 1];
                    map = mapCtx.componentRef.map;
                    const ll = {
                        lat: candidate.lat,
                        lng: candidate.lng
                    };
                    map.setZoom(17);
                    map.setCenter(ll);

                    const displayType = localStorage["wfmm_map_display_" + userId];
                    // if the selected type is map then we don't change anything

                    if (displayType === 'satellite') {
                        // hybrid includes labels as well as satellite imagery
                        map.setMapTypeId('hybrid');
                    } else if (displayType === 'streetview') {
                        // do this here as well as a fallback if no SV image available
                        map.setMapTypeId('hybrid');
                        let sv = map.getStreetView();
                        sv.setOptions({
                            motionTracking: false,
                            imageDateControl: true
                        });
                        const svClient = new google.maps.StreetViewService;
                        svClient.getPanoramaByLocation(ll, 50, function(result, status) {
                            if (status === "OK") {
                                listenSVFocus = true;
                                const nomLocation = new google.maps.LatLng(ll.lat, ll.lng);
                                const svLocation = result.location.latLng;
                                const heading = google.maps.geometry.spherical.computeHeading(svLocation, nomLocation);
                                pano = sv;
                                pano.setPosition(svLocation);
                                pano.setPov({
                                    heading,
                                    pitch: 0,
                                    zoom: 1
                                });
                                pano.setVisible(true);
                            } else {
                                const warningBox = document.createElement('p');
                                warningBox.classList.add('wayfarerrmm__warningbox');
                                warningBox.textContent = "No Streetview found within a close radius";
                                ref.parentElement.insertBefore(warningBox, ref);
                            }
                        });
                    }
                    addNearbyTooltips();
                }
                const {
                    cellSize,
                    cellColor,
                    secondGridEnabled,
                    cellSizeTwo,
                    cellColorTwo
                } = getDrawSettings();

                if (isDisplayGridEnabled()) {
                    addS2Overlay(cellSize, cellColor, secondGridEnabled, cellSizeTwo, cellColorTwo);
                    addS2HighlightAtCoords(candidate['lat'], candidate['lng']);
                }
                locationChangeBtnListener();
                locationResetChangeBtnListener();
            })
            .catch(() => {
                return;
            });
    }

    function locationChangeBtnListener() {
        const markerone = mapCtx.markers.default.markers[0];
        const locationChangeBtn = document.querySelector("#check-duplicates-card nia-map ~ div button");
        if (locationChangeBtn) {

            locationChangeBtn.addEventListener('click', function() {
                drawCloseCircle();
                drawMoveCircle();
                addListenerToMarker(true);
            }, true);
        } else {
            setTimeout(locationChangeBtnListener, 250);
            return;
        }
    }

    function locationResetChangeBtnListener() {
        let resetButton = document.querySelector("#check-duplicates-card .wf-review-card__header button");
        if (resetButton) {
            resetButton.onclick = function() {
                map.setZoom(17);
                drawCloseCircle();
                if (isDisplayGridEnabled()) {
                    addS2Highlight();
                }
                locationChangeBtnListener();
                locationResetChangeBtnListener();
            }
        }
    }

    function isDisplayGridEnabled() {
        userId = getUserId();
        let displayGrid = localStorage["wfmm_grid_enabled_" + userId];
        if (displayGrid === undefined || displayGrid === null || displayGrid === "false" || displayGrid === "") {
            displayGrid = false;
            localStorage["wfmm_grid_enabled_" + userId] = displayGrid;
        }
        return displayGrid === "true";
    }

    function addListenerToMarker(firstTime) {
        if (firstTime) {
            setTimeout(function() {
                addListenerToMarker(false)
            }, 500);
        }
        if (mapCtx.markers.suggested) {
            const _markerOnDrag = mapCtx.markers.suggested.markerOnDrag;
            mapCtx.markers.suggested.markerOnDrag = function(t) {
                if (t) {
                    if (t.lat) {
                        drawCloseCircleAtCoords(t['lat'], t['lng']);
                        if (isDisplayGridEnabled()) {
                            addS2HighlightAtCoords(t['lat'], t['lng']);
                        }
                    }
                }
                _markerOnDrag(t);
            };
        } else {
            setTimeout(function() {
                addListenerToMarker(false)
            }, 250);
            return;
        }
    }

    function addNearbyTooltips() {
        const markerDiv = document.querySelector("#check-duplicates-card nia-map agm-map div.agm-map-container-inner > div > div > div:nth-child(2) > div:nth-child(2) > div > div:nth-child(3)");
        if (!markerDiv) {
            setTimeout(addNearbyTooltips, 500);
            return;
        }

        let markers = markerDiv.children;
        if (markers.length <= 1) {
            setTimeout(addNearbyTooltips, 500);
            return;
        }
        markers = Array.from(markers).filter(m => window.getComputedStyle(m).width === "32px");

        let closeMarker = false;
        const nomCoords = [candidate["lat"], candidate["lng"]];
        nearby = mapCtx.markers.nearby;
        if (nearby.markers && nearby.markers.length > 0) {
            for (let i = 0; i < nearby.markers.length; i++) {
                markers[i].title = nearby.markers[i]['infoWindowComponentData']['title']
                if (!closeMarker) {
                    const distance = haversineDistance(nomCoords, [nearby.markers[i]["latitude"], nearby.markers[i]["longitude"]]);
                    if (distance <= 20) {
                        closeMarker = true;
                    }
                }
            }
        }

        if (closeMarker) {
            addDupeCheckWarning();
        }
    }

    function haversineDistance(coords1, coords2) {
        function toRad(x) {
            return x * Math.PI / 180;
        }

        let lat1 = coords1[0];
        let lon1 = coords1[1];

        let lat2 = coords2[0];
        let lon2 = coords2[1];
        let R = 6371; // km

        let x1 = lat2 - lat1;
        let dLat = toRad(x1);
        let x2 = lon2 - lon1;
        let dLon = toRad(x2)
        let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        let d = R * c;

        return d * 1000;
    }

    function addDupeCheckWarning() {
        let header = document.querySelector("body > app-root > app-wayfarer > div > mat-sidenav-container > mat-sidenav-content > div > app-review > wf-page-header > div > div:nth-child(1) > p > div");
        if (header) {
            header.innerText = "There is at least one waypoint within 20 meters of this nomination, check closely for duplicates!";
            header.style.color = "red";
        }
    }

    function addSettings() {
        awaitElement(
            () => document.querySelector("body > app-root > app-wayfarer > div > mat-sidenav-container > mat-sidenav-content > div > app-review > div.flex.justify-center.mt-8.ng-star-inserted")
        ).then(ref => {
            userId = getUserId();

            let settingsDiv = document.getElementById("wayfarerrtsettings");
            if (!settingsDiv) {
                settingsDiv = document.createElement('div');
                settingsDiv.id = "wayfarerrtsettings";
                settingsDiv.classList.add('wayfarerrh__visible');

                const settingsContainer = document.createElement('div');
                settingsContainer.setAttribute('class', 'wrap-collabsible')
                settingsContainer.id = "settingsContainer";

                const collapsibleInput = document.createElement("input");
                collapsibleInput.id = "collapsedSettings";
                collapsibleInput.setAttribute("class", "toggle");
                collapsibleInput.type = "checkbox";

                const collapsibleLabel = document.createElement("label");
                collapsibleLabel.setAttribute("class", "lbl-toggle-es");
                collapsibleLabel.innerText = "Add-on Settings";
                collapsibleLabel.setAttribute("for", "collapsedSettings");

                const collapsibleContent = document.createElement("div");
                collapsibleContent.setAttribute("class", "collapsible-content-es");

                collapsibleContent.appendChild(settingsDiv);
                settingsContainer.appendChild(collapsibleInput);
                settingsContainer.appendChild(collapsibleLabel);
                settingsContainer.appendChild(collapsibleContent);
                insertAfter(settingsContainer, ref);
            }

            let selection = localStorage["wfmm_map_display_" + userId];
            if (!selection) {
                selection = 'satellite';
                localStorage["wfmm_map_display_" + userId] = selection;
            }

            let displayGridInput = document.createElement('input');
            displayGridInput.setAttribute("type", "checkbox");
            let displayGridEnabled = localStorage["wfmm_grid_enabled_" + userId];
            if (displayGridEnabled === undefined || displayGridEnabled === null || displayGridEnabled === "") {
                displayGridEnabled = false;
            }
            displayGridInput.checked = displayGridEnabled === "true";
            displayGridInput.addEventListener('change', function() {
                displayGridEnabled = this.checked;
                localStorage["wfmm_grid_enabled_" + userId] = displayGridEnabled;
            });
            displayGridInput.id = "wayfarermmgridenabled";
            displayGridInput.classList.add('wayfarercc_input');

            const displayGridLabel = document.createElement("label");
            displayGridLabel.innerText = "Draw S2 Grid Cells:";
            displayGridLabel.setAttribute("for", "wayfarermmgridenabled");
            displayGridLabel.classList.add('wayfareres_settings_label');

            const displayCellsLabel = document.createElement("label");
            displayCellsLabel.innerText = "Review Map Cell Size:";
            displayCellsLabel.setAttribute("for", "wayfarermmcellsizeone");
            displayCellsLabel.classList.add('wayfareres_settings_label');

            let cellSizeInput = document.createElement('input');
            cellSizeInput.setAttribute("type", "number");
            cellSizeInput.setAttribute("size", '2');
            let cellSize = localStorage["wfmm_cell_size_one_" + userId];
            if (cellSize === undefined || cellSize === null || cellSize === "false" || cellSize === "") {
                cellSize = 17;
                localStorage["wfmm_cell_size_one_" + userId] = cellSize;
            }
            cellSizeInput.value = cellSize;
            cellSizeInput.addEventListener('change', function() {
                cellSize = this.value;
                localStorage["wfmm_cell_size_one_" + userId] = cellSize;
            });
            cellSizeInput.id = "wayfarermmcellsizeone";
            cellSizeInput.classList.add('wayfarercc_input');

            const cellSizeLabel = document.createElement("label");
            cellSizeLabel.innerText = "Review Map Cell Size:";
            cellSizeLabel.setAttribute("for", "wayfarermmcellsizeone");
            cellSizeLabel.classList.add('wayfareres_settings_label');

            let cellColorInput = document.createElement('input');
            cellColorInput.setAttribute("type", "text");
            cellColorInput.setAttribute("minlength", '6');
            cellColorInput.setAttribute("maxlength", '7');
            cellColorInput.setAttribute("size", '2');
            let cellColor = localStorage["wfmm_cell_color_one_" + userId];
            if (cellColor === undefined || cellColor === null || cellColor === "false" || cellColor === "") {
                cellColor = "#FF0000";
                localStorage["wfmm_cell_color_one_" + userId] = cellColor;
            }
            cellColorInput.value = cellColor;
            cellColorInput.addEventListener('change', function() {
                cellColor = this.value;
                localStorage["wfmm_cell_color_one_" + userId] = cellColor;
            });
            cellColorInput.id = "wayfarermmcellcolorone";
            cellColorInput.classList.add('wayfarercc_input');
            cellColorInput.type = "color";

            const cellColorLabel = document.createElement("label");
            cellColorLabel.innerText = "Review Map Grid Color:";
            cellColorLabel.setAttribute("for", "wayfarermmcellcolorone");
            cellColorLabel.classList.add('wayfareres_settings_label');

            // second grid cell
            let secondGridEnabledInput = document.createElement('input');
            secondGridEnabledInput.setAttribute("type", "checkbox");
            let secondGridEnabled = localStorage["wfmm_second_grid_enabled_" + userId];
            if (secondGridEnabled === undefined || secondGridEnabled === null || secondGridEnabled === "") {
                secondGridEnabled = false;
            }
            secondGridEnabledInput.checked = secondGridEnabled === "true";
            secondGridEnabledInput.addEventListener('change', function() {
                secondGridEnabled = this.checked;
                localStorage["wfmm_second_grid_enabled_" + userId] = secondGridEnabled;
            });
            secondGridEnabledInput.id = "wayfarermmsecondgridenabled";
            secondGridEnabledInput.classList.add('wayfarercc_input');

            const secondGridEnabledLabel = document.createElement("label");
            secondGridEnabledLabel.innerText = "Draw Second Grid Cells:";
            secondGridEnabledLabel.setAttribute("for", "wayfarermmsecondgridenabled");
            secondGridEnabledLabel.classList.add('wayfareres_settings_label');

            let cellSizeInputTwo = document.createElement('input');
            cellSizeInputTwo.setAttribute("type", "number");
            cellSizeInputTwo.setAttribute("size", '2');
            cellSize = localStorage["wfmm_cell_size_two_" + userId];
            if (cellSize === undefined || cellSize === null || cellSize === "false" || cellSize === "") {
                cellSize = 14;
                localStorage["wfmm_cell_size_two_" + userId] = cellSize;
            }
            cellSizeInputTwo.value = cellSize;
            cellSizeInputTwo.addEventListener('change', function() {
                cellSize = this.value;
                localStorage["wfmm_cell_size_two_" + userId] = cellSize;
            });
            cellSizeInputTwo.id = "wayfarermmcellsizetwo";
            cellSizeInputTwo.classList.add('wayfarercc_input');

            const cellSizeLabelTwo = document.createElement("label");
            cellSizeLabelTwo.innerText = "Review Map 2nd Cell Size:";
            cellSizeLabelTwo.setAttribute("for", "wayfarermmcellsizetwo");
            cellSizeLabelTwo.classList.add('wayfareres_settings_label');

            let cellColorInputTwo = document.createElement('input');
            cellColorInputTwo.setAttribute("type", "text");
            cellColorInputTwo.setAttribute("minlength", '6');
            cellColorInputTwo.setAttribute("maxlength", '7');
            cellColorInputTwo.setAttribute("size", '2');
            cellColor = localStorage["wfmm_cell_color_two_" + userId];
            if (cellColor === undefined || cellColor === null || cellColor === "false" || cellColor === "") {
                cellColor = "#FF0000";
                localStorage["wfmm_cell_color_two_" + userId] = cellColor;
            }
            cellColorInputTwo.value = cellColor;
            cellColorInputTwo.addEventListener('change', function() {
                cellColor = this.value;
                localStorage["wfmm_cell_color_two_" + userId] = cellColor;
            });
            cellColorInputTwo.id = "wayfarermmcellcolortwo";
            cellColorInputTwo.type = "color";
            cellColorInputTwo.classList.add('wayfarercc_input');

            const cellColorLabelTwo = document.createElement("label");
            cellColorLabelTwo.innerText = "Review Map 2nd Grid Color:";
            cellColorLabelTwo.setAttribute("for", "wayfarermmcellcolortwo");
            cellColorLabelTwo.classList.add('wayfareres_settings_label');

            const div = document.createElement('div');
            let select = document.createElement('select');
            select.title = "Default Map View";
            const mapTypes = [{
                name: "map",
                title: "Map"
            }, {
                name: "satellite",
                title: "Satellite"
            }, {
                name: "streetview",
                title: "Streetview"
            }];
            select.innerHTML = mapTypes.map(item => `<option value="${item.name}" ${item.name == selection ? 'selected' : ''}>${item.title}</option>`).join('');
            select.addEventListener('change', function() {
                selection = select.value;
                localStorage["wfmm_map_display_" + userId] = selection;
            });
            select.id = 'wayfarermmmapdisplay';
            select.classList.add('wayfarercc_select');

            const selectLabel = document.createElement("label");
            selectLabel.innerText = "Default Map View:";
            selectLabel.setAttribute("for", "wayfarermmmapdisplay");
            selectLabel.classList.add('wayfareres_settings_label');

            settingsDiv.appendChild(document.createElement('br'));
            settingsDiv.appendChild(displayGridLabel);
            settingsDiv.appendChild(displayGridInput);
            settingsDiv.appendChild(document.createElement('br'));
            settingsDiv.appendChild(cellSizeLabel);
            settingsDiv.appendChild(cellSizeInput);
            settingsDiv.appendChild(document.createElement('br'));
            settingsDiv.appendChild(cellColorLabel);
            settingsDiv.appendChild(cellColorInput);
            settingsDiv.appendChild(document.createElement('br'));
            settingsDiv.appendChild(secondGridEnabledLabel);
            settingsDiv.appendChild(secondGridEnabledInput);
            settingsDiv.appendChild(document.createElement('br'));
            settingsDiv.appendChild(cellSizeLabelTwo);
            settingsDiv.appendChild(cellSizeInputTwo);
            settingsDiv.appendChild(document.createElement('br'));
            settingsDiv.appendChild(cellColorLabelTwo);
            settingsDiv.appendChild(cellColorInputTwo);
            settingsDiv.appendChild(document.createElement('br'));
            settingsDiv.appendChild(selectLabel);
            settingsDiv.appendChild(select);
            settingsDiv.appendChild(document.createElement('br'));
        })
    };

    function getUserId() {
        return userHash + '';
    }

    function old_getUserId() {
        var els = document.getElementsByTagName("image");
        for (var i = 0; i < els.length; i++) {
            const element = els[i];
            const attribute = element.getAttribute("href");
            let fields = attribute.split('/');
            let userId = fields[fields.length - 1];
            fields = userId.split('=');
            userId = fields[0];
            return userId;
        }
        return "temporary_default_userid";
    }

    function migrateProps() {
        let userId = getUserId();
        let migrated = localStorage["wfmm_data_migrated_" + userId];
        if (migrated !== undefined && migrated !== null && migrated !== "") {
            migrated = migrated === "true";
        }

        if (migrated) {
            return;
        }

        awaitElement(() =>document.querySelector(".wf-upgrade-viz"))
            .then((ref) => {
                // migrate stored settings. this will be some extra calls for a time but will avoid one final "reset"
                // todo: remove in a future update
                const oldUserId = old_getUserId();
                if (oldUserId === "temporary_default_userid") {
                    return;
                }

                const newUserId = getUserId();

                const displayType = localStorage["wfmm_map_display" + userId];
                if (displayType !== undefined && displayType !== null && displayType !== "false" && displayType !== "") {
                    localStorage["wfmm_map_display_" + newUserId] = displayType;
                }

                const displayGrid = localStorage["wfmm_grid_enabled_" + userId];
                if (displayGrid !== undefined && displayGrid !== null && displayGrid !== "false" && displayGrid !== "") {
                    localStorage["wfmm_grid_enabled_" + newUserId] = displayGrid;
                }

                const cellSize = localStorage["wfmm_cell_size_one_" + userId];
                if (cellSize !== undefined && cellSize !== null && cellSize !== "false" && cellSize !== "") {
                    localStorage["wfmm_cell_size_one_" + newUserId] = cellSize;
                }

                const cellColor = localStorage["wfmm_cell_color_one_" + userId];
                    if (cellColor !== undefined && cellColor !== null && cellColor !== "false" && cellColor !== "") {
                    localStorage["wfmm_cell_color_one_" + newUserId] = cellColor;
                }

                const secondGridEnabled = localStorage["wfmm_second_grid_enabled_" + userId];
                    if (secondGridEnabled !== undefined && secondGridEnabled !== null && secondGridEnabled !== "false" && secondGridEnabled !== "") {
                    localStorage["wfmm_second_grid_enabled_" + newUserId] = secondGridEnabled;
                }

                const cellSizeTwo = localStorage["wfmm_cell_size_two_" + userId];
                if (cellSizeTwo !== undefined && cellSizeTwo !== null && cellSizeTwo !== "false" && cellSizeTwo !== "") {
                    localStorage["wfmm_cell_size_two_" + newUserId] = cellSizeTwo;
                }

                const cellColorTwo = localStorage["wfmm_cell_color_two_" + userId];
                    if (cellColorTwo !== undefined && cellColorTwo !== null && cellColorTwo !== "false" && cellColorTwo !== "") {
                    localStorage["wfmm_cell_color_two_" + newUserId] = cellColorTwo;
                }

                // now clear out all old storage items for this plugin
                Object.keys(localStorage)
                 .filter(x => x.startsWith('wfmm_') && !x.includes(userId))
                 .forEach(x => {
                    console.log(`wfmm removing old storage key: ${x}`);
                    localStorage.removeItem(x)
                });

                localStorage["wfmm_data_migrated_" + userId] = "true";
            })
    }

    class S2Overlay {
        constructor() {
            this.polyLines = [];
        }


        check_map_bounds_ready(map) {
            if (!map || map.getBounds === undefined || map.getBounds() === undefined) {
                return false;
            } else {
                return true;
            }
        };

        until(conditionFunction, map) {
            const poll = resolve => {
                if (conditionFunction(map)) resolve();
                else setTimeout(_ => poll(resolve), 400);
            };

            return new Promise(poll);
        }

        updateGrid(map, gridLevel, col, secondGridLevel = null, secondCol = null) {
            this.polyLines.forEach((line) => {
                line.setMap(null)
            });
            let ret = this.drawCellGrid(map, gridLevel, col);
            if (secondGridLevel !== null) {
                this.drawCellGrid(map, secondGridLevel, secondCol, 2);
            }
            return ret;
        }

        async drawCellGrid(map, gridLevel, col, thickness = 1) {
            await this.until(this.check_map_bounds_ready, map);
            const bounds = map.getBounds();

            const seenCells = {};
            const cellsToDraw = [];


            if (gridLevel >= 2 && gridLevel < (map.getZoom() + 2)) {
                const latLng = map.getCenter()
                const cell = S2.S2Cell.FromLatLng(this.getLatLngPoint(latLng), gridLevel);
                cellsToDraw.push(cell);
                seenCells[cell.toString()] = true;

                let curCell;
                while (cellsToDraw.length > 0) {
                    curCell = cellsToDraw.pop();
                    const neighbors = curCell.getNeighbors();

                    for (let n = 0; n < neighbors.length; n++) {
                        const nStr = neighbors[n].toString();
                        if (!seenCells[nStr]) {
                            seenCells[nStr] = true;
                            if (this.isCellOnScreen(bounds, neighbors[n])) {
                                cellsToDraw.push(neighbors[n]);
                            }
                        }
                    }

                    this.drawCell(map, curCell, col, thickness);
                }
            }
        };

        drawCell(map, cell, col, thickness) {
            const cellCorners = cell.getCornerLatLngs();
            cellCorners[4] = cellCorners[0]; //Loop it

            const polyline = new google.maps.Polyline({
                path: cellCorners,
                geodesic: true,
                fillColor: 'grey',
                fillOpacity: 0.0,
                strokeColor: col,
                strokeOpacity: 1,
                strokeWeight: thickness,
                map: map
            });
            this.polyLines.push(polyline);
        };

        getLatLngPoint(data) {
            const result = {
                lat: typeof data.lat == 'function' ? data.lat() : data.lat,
                lng: typeof data.lng == 'function' ? data.lng() : data.lng
            };

            return result;
        };

        isCellOnScreen(mapBounds, cell) {
            const corners = cell.getCornerLatLngs();
            for (let i = 0; i < corners.length; i++) {
                if (mapBounds.intersects(new google.maps.LatLngBounds(corners[i]))) {
                    return true;
                }
            }
            return false;
        };
    }

    function addS2Overlay(gridLevel, color, secondGridEnabled, gridLevelTwo, colorTwo) {
        overlay = new S2Overlay();

        if (secondGridEnabled) {
            //To make sure bigger cells are always drawn on top of smaller cells regardless of user config order
            //If they are equal draw order doesn't matter
            let smallGridLevel, bigGridLevel, smallColor, bigColor;
            if (gridLevel > gridLevelTwo) { //eg. L14 cells are bigger than L15 cells
                smallGridLevel = gridLevel;
                smallColor = color;
                bigGridLevel = gridLevelTwo;
                bigColor = colorTwo;
            } else {
                smallGridLevel = gridLevelTwo;
                smallColor = colorTwo;
                bigGridLevel = gridLevel;
                bigColor = color;
            }

            overlay.drawCellGrid(map, smallGridLevel, smallColor);
            overlay.drawCellGrid(map, bigGridLevel, bigColor, 2);

            map.addListener('idle', () => {
                overlay.updateGrid(map, smallGridLevel, smallColor, bigGridLevel, bigColor);
            });
        } else {
            overlay.drawCellGrid(map, gridLevel, color);

            map.addListener('idle', () => {
                overlay.updateGrid(map, gridLevel, color);
            });
        }
    }

    function drawMoveCircle() {
        if (moveCircle) {
            moveCircle.setMap(null)
        }
        const {
            lat,
            lng
        } = candidate;
        const latLng = new google.maps.LatLng(lat, lng);
        moveCircle = new google.maps.Circle({
            map: map,
            center: latLng,
            radius: 2,
            strokeColor: 'red',
            fillColor: 'red',
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillOpacity: 0.2
        });
    }

    function drawMoveCircleAtCoords(lat, lng) {
        if (moveCircle) {
            moveCircle.setMap(null)
        }
        const latLng = new google.maps.LatLng(lat, lng);
        moveCircle = new google.maps.Circle({
            map: map,
            center: latLng,
            radius: 2,
            strokeColor: 'red',
            fillColor: 'red',
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillOpacity: 0.2
        });
    }

    function drawCloseCircle() {
        if (closeCircle) {
            closeCircle.setMap(null)
        }
        const {
            lat,
            lng
        } = candidate;
        const latLng = new google.maps.LatLng(lat, lng);
        closeCircle = new google.maps.Circle({
            map: map,
            center: latLng,
            radius: 20,
            strokeColor: 'blue',
            fillColor: 'blue',
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillOpacity: 0.2
        });
    }

    function drawCloseCircleAtCoords(lat, lng) {
        if (closeCircle) {
            closeCircle.setMap(null)
        }
        const latLng = new google.maps.LatLng(lat, lng);
        closeCircle = new google.maps.Circle({
            map: map,
            center: latLng,
            radius: 20,
            strokeColor: 'blue',
            fillColor: 'blue',
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillOpacity: 0.2
        });
    }

    function addS2Highlight() {
        if (cellShade) {
            cellShade.setMap(null)
        }

        const {
            lat,
            lng
        } = candidate;
        const {
            cellSize
        } = getDrawSettings();
        let cell = window.S2.S2Cell.FromLatLng({
            lat: lat,
            lng: lng
        }, cellSize);

        let cellCorners = cell.getCornerLatLngs();
        cellCorners[4] = cellCorners[0]; //Loop it

        cellShade = new google.maps.Polygon({
            path: cellCorners,
            geodesic: true,
            fillColor: '#000',
            fillOpacity: 0.2,
            strokeOpacity: 0,
            strokeWeight: 0,
            map: map
        });
    }

    function addS2HighlightAtCoords(lat, lng) {
        if (cellShade) {
            cellShade.setMap(null)
        }

        const {
            cellSize
        } = getDrawSettings();
        let cell = window.S2.S2Cell.FromLatLng({
            lat: lat,
            lng: lng
        }, cellSize);

        let cellCorners = cell.getCornerLatLngs();
        cellCorners[4] = cellCorners[0]; //Loop it

        cellShade = new google.maps.Polygon({
            path: cellCorners,
            geodesic: true,
            fillColor: '#000',
            fillOpacity: 0.2,
            strokeOpacity: 0,
            strokeWeight: 0,
            map: map
        });
    }

    function getDrawSettings() {
        userId = getUserId();
        let cellSize = localStorage["wfmm_cell_size_one_" + userId];
        if (cellSize === undefined || cellSize === null || cellSize === "false" || cellSize === "") {
            cellSize = 17;
            localStorage["wfmm_cell_size_one_" + userId] = cellSize;
        }
        let cellColor = localStorage["wfmm_cell_color_one_" + userId];
        if (cellColor === undefined || cellColor === null || cellColor === "false" || cellColor === "") {
            cellColor = "#FF0000";
            localStorage["wfmm_cell_color_one_" + userId] = cellColor;
        }

        let secondGridEnabled = localStorage["wfmm_second_grid_enabled_" + userId];
        if (secondGridEnabled === undefined || secondGridEnabled === null || secondGridEnabled === "") {
            secondGridEnabled = false;
        } else {
            secondGridEnabled = secondGridEnabled === "true";
        }

        let cellSizeTwo = localStorage["wfmm_cell_size_two_" + userId];
        if (cellSizeTwo === undefined || cellSizeTwo === null || cellSizeTwo === "false" || cellSizeTwo === "") {
            cellSizeTwo = 14;
            localStorage["wfmm_cell_size_two_" + userId] = cellSizeTwo;
        }
        let cellColorTwo = localStorage["wfmm_cell_color_two_" + userId];
        if (cellColorTwo === undefined || cellColorTwo === null || cellColorTwo === "false" || cellColorTwo === "") {
            cellColorTwo = "#0000FF";
            localStorage["wfmm_cell_color_two_" + userId] = cellColorTwo;
        }

        return {
            "cellSize": cellSize,
            "cellColor": cellColor,
            "secondGridEnabled": secondGridEnabled,
            "cellSizeTwo": cellSizeTwo,
            "cellColorTwo": cellColorTwo
        };
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

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    };

    function addCss() {
        const css = `
            .wayfarercc {
                color: #333;
                margin-left: 2em;
                padding-top: 0.3em;
                text-align: center;
                display: none;
              }

            .wayfarercc_select {
                margin:  2px 12px;
                padding: 2px 12px;
                background-color: #FFFFFF;
                color: black;
            }

            .wayfarercc_input {
                margin:  2px 12px;
                padding: 2px 12px;
                width: 90px;
                background-color: #FFFFFF;
                color: black;
            }

            .wayfareres_settings_label {
                margin:  2px 12px;
                padding: 2px 12px;
                color: black;
                font-size: 16px;
            }

            .wrap-collabsible {
                margin: 1.2rem auto;
            }

            #collapsible,
            #collapsed-stats {
                display: none;
            }

            .lbl-toggle-es {
                display: block;
                font-weight: bold;
                font-family: monospace;
                font-size: 1.2rem;
                text-transform: uppercase;
                text-align: center;
                padding: 1rem;
                color: white;
                background: #DF471C;
                cursor: pointer;
                border-radius: 7px;
                transition: all 0.25s ease-out;
                width: 50%;
                margin: auto;
            }

            .lbl-toggle-es:hover {
                color: lightgrey;
            }

            .lbl-toggle-es::before {
                content: ' ';
                display: inline-block;
                border-top: 5px solid transparent;
                border-bottom: 5px solid transparent;
                border-left: 5px solid currentColor;
                vertical-align: middle;
                margin-right: .7rem;
                transform: translateY(-2px);
                transition: transform .2s ease-out;
            }

            .toggle {
                display:none;
            }

            .toggle:checked+.lbl-toggle-es::before {
                transform: rotate(90deg) translateX(-3px);
            }

            .collapsible-content-es {
                max-height: 0px;
                overflow: hidden;
                transition: max-height .25s ease-in-out;
                font-size: 16px;
                background-color: #e5e5e5;
                border: 1px;
                border-radius: 3px;
                border-style: double;
                border-color: #ff4713;
                margin: auto;
                width: 50%;
            }

            .toggle:checked+.lbl-toggle-es+.collapsible-content-es {
                max-height: 9999999pt;
            }

            .toggle:checked+.lbl-toggle-es {
                border-bottom-right-radius: 0;
                border-bottom-left-radius: 0;
            }

            .collapsible-content-es .content-inner {
                border-bottom: 1px solid rgba(0, 0, 0, 1);
                border-left: 1px solid rgba(0, 0, 0, 1);
                border-right: 1px solid rgba(0, 0, 0, 1);
                border-bottom-left-radius: 7px;
                border-bottom-right-radius: 7px;
                padding: .5rem 1rem;
            }

            .wayfarerrmm__warningbox {
                font-size: 1.1em;
                font-weight: bold;
                color: black;
            }
            .dark .wayfarerrmm__warningbox {
                color: white;
            }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }

    // start s2 lib code
    (function(exports) {
        'use strict';

        var S2 = exports.S2 = {
            L: {}
        };

        S2.L.LatLng = function( /*Number*/ rawLat, /*Number*/ rawLng, /*Boolean*/ noWrap) {
            var lat = parseFloat(rawLat, 10);
            var lng = parseFloat(rawLng, 10);

            if (isNaN(lat) || isNaN(lng)) {
                throw new Error('Invalid LatLng object: (' + rawLat + ', ' + rawLng + ')');
            }

            if (noWrap !== true) {
                lat = Math.max(Math.min(lat, 90), -90); // clamp latitude into -90..90
                lng = (lng + 180) % 360 + ((lng < -180 || lng === 180) ? 180 : -180); // wrap longtitude into -180..180
            }

            return {
                lat: lat,
                lng: lng
            };
        };

        S2.L.LatLng.DEG_TO_RAD = Math.PI / 180;
        S2.L.LatLng.RAD_TO_DEG = 180 / Math.PI;

        S2.LatLngToXYZ = function(latLng) {
            var d2r = S2.L.LatLng.DEG_TO_RAD;

            var phi = latLng.lat * d2r;
            var theta = latLng.lng * d2r;

            var cosphi = Math.cos(phi);

            return [Math.cos(theta) * cosphi, Math.sin(theta) * cosphi, Math.sin(phi)];
        };

        S2.XYZToLatLng = function(xyz) {
            var r2d = S2.L.LatLng.RAD_TO_DEG;

            var lat = Math.atan2(xyz[2], Math.sqrt(xyz[0] * xyz[0] + xyz[1] * xyz[1]));
            var lng = Math.atan2(xyz[1], xyz[0]);

            return S2.L.LatLng(lat * r2d, lng * r2d);
        };

        var largestAbsComponent = function(xyz) {
            var temp = [Math.abs(xyz[0]), Math.abs(xyz[1]), Math.abs(xyz[2])];

            if (temp[0] > temp[1]) {
                if (temp[0] > temp[2]) {
                    return 0;
                } else {
                    return 2;
                }
            } else {
                if (temp[1] > temp[2]) {
                    return 1;
                } else {
                    return 2;
                }
            }

        };

        var faceXYZToUV = function(face, xyz) {
            var u, v;

            switch (face) {
                case 0:
                    u = xyz[1] / xyz[0];
                    v = xyz[2] / xyz[0];
                    break;
                case 1:
                    u = -xyz[0] / xyz[1];
                    v = xyz[2] / xyz[1];
                    break;
                case 2:
                    u = -xyz[0] / xyz[2];
                    v = -xyz[1] / xyz[2];
                    break;
                case 3:
                    u = xyz[2] / xyz[0];
                    v = xyz[1] / xyz[0];
                    break;
                case 4:
                    u = xyz[2] / xyz[1];
                    v = -xyz[0] / xyz[1];
                    break;
                case 5:
                    u = -xyz[1] / xyz[2];
                    v = -xyz[0] / xyz[2];
                    break;
                default:
                    throw {
                        error: 'Invalid face'
                    };
            }

            return [u, v];
        };



        S2.XYZToFaceUV = function(xyz) {
            var face = largestAbsComponent(xyz);

            if (xyz[face] < 0) {
                face += 3;
            }

            var uv = faceXYZToUV(face, xyz);

            return [face, uv];
        };

        S2.FaceUVToXYZ = function(face, uv) {
            var u = uv[0];
            var v = uv[1];

            switch (face) {
                case 0:
                    return [1, u, v];
                case 1:
                    return [-u, 1, v];
                case 2:
                    return [-u, -v, 1];
                case 3:
                    return [-1, -v, -u];
                case 4:
                    return [v, -1, -u];
                case 5:
                    return [v, u, -1];
                default:
                    throw {
                        error: 'Invalid face'
                    };
            }
        };

        var singleSTtoUV = function(st) {
            if (st >= 0.5) {
                return (1 / 3.0) * (4 * st * st - 1);
            } else {
                return (1 / 3.0) * (1 - (4 * (1 - st) * (1 - st)));
            }
        };

        S2.STToUV = function(st) {
            return [singleSTtoUV(st[0]), singleSTtoUV(st[1])];
        };


        var singleUVtoST = function(uv) {
            if (uv >= 0) {
                return 0.5 * Math.sqrt(1 + 3 * uv);
            } else {
                return 1 - 0.5 * Math.sqrt(1 - 3 * uv);
            }
        };
        S2.UVToST = function(uv) {
            return [singleUVtoST(uv[0]), singleUVtoST(uv[1])];
        };


        S2.STToIJ = function(st, order) {
            var maxSize = (1 << order);

            var singleSTtoIJ = function(st) {
                var ij = Math.floor(st * maxSize);
                return Math.max(0, Math.min(maxSize - 1, ij));
            };

            return [singleSTtoIJ(st[0]), singleSTtoIJ(st[1])];
        };


        S2.IJToST = function(ij, order, offsets) {
            var maxSize = (1 << order);

            return [
                (ij[0] + offsets[0]) / maxSize,
                (ij[1] + offsets[1]) / maxSize
            ];
        };



        var rotateAndFlipQuadrant = function(n, point, rx, ry) {
            var newX, newY;
            if (ry == 0) {
                if (rx == 1) {
                    point.x = n - 1 - point.x;
                    point.y = n - 1 - point.y

                }

                var x = point.x;
                point.x = point.y
                point.y = x;
            }

        }


        // hilbert space-filling curve
        // based on http://blog.notdot.net/2009/11/Damn-Cool-Algorithms-Spatial-indexing-with-Quadtrees-and-Hilbert-Curves
        // note: rather then calculating the final integer hilbert position, we just return the list of quads
        // this ensures no precision issues whth large orders (S3 cell IDs use up to 30), and is more
        // convenient for pulling out the individual bits as needed later
        var pointToHilbertQuadList = function(x, y, order, face) {
            var hilbertMap = {
                'a': [
                    [0, 'd'],
                    [1, 'a'],
                    [3, 'b'],
                    [2, 'a']
                ],
                'b': [
                    [2, 'b'],
                    [1, 'b'],
                    [3, 'a'],
                    [0, 'c']
                ],
                'c': [
                    [2, 'c'],
                    [3, 'd'],
                    [1, 'c'],
                    [0, 'b']
                ],
                'd': [
                    [0, 'a'],
                    [3, 'c'],
                    [1, 'd'],
                    [2, 'd']
                ]
            };

            if ('number' !== typeof face) {
                console.warn(new Error("called pointToHilbertQuadList without face value, defaulting to '0'").stack);
            }
            var currentSquare = (face % 2) ? 'd' : 'a';
            var positions = [];

            for (var i = order - 1; i >= 0; i--) {

                var mask = 1 << i;

                var quad_x = x & mask ? 1 : 0;
                var quad_y = y & mask ? 1 : 0;

                var t = hilbertMap[currentSquare][quad_x * 2 + quad_y];

                positions.push(t[0]);

                currentSquare = t[1];
            }

            return positions;
        };

        // S2Cell class

        S2.S2Cell = function() {};

        S2.S2Cell.FromHilbertQuadKey = function(hilbertQuadkey) {
            var parts = hilbertQuadkey.split('/');
            var face = parseInt(parts[0]);
            var position = parts[1];
            var maxLevel = position.length;
            var point = {
                x: 0,
                y: 0
            };
            var i;
            var level;
            var bit;
            var rx, ry;
            var val;

            for (i = maxLevel - 1; i >= 0; i--) {

                level = maxLevel - i;
                bit = position[i];
                rx = 0;
                ry = 0;
                if (bit === '1') {
                    ry = 1;
                } else if (bit === '2') {
                    rx = 1;
                    ry = 1;
                } else if (bit === '3') {
                    rx = 1;
                }

                val = Math.pow(2, level - 1);
                rotateAndFlipQuadrant(val, point, rx, ry);

                point.x += val * rx;
                point.y += val * ry;

            }

            if (face % 2 === 1) {
                var t = point.x;
                point.x = point.y;
                point.y = t;
            }


            return S2.S2Cell.FromFaceIJ(parseInt(face), [point.x, point.y], level);
        };

        //static method to construct
        S2.S2Cell.FromLatLng = function(latLng, level) {
            if ((!latLng.lat && latLng.lat !== 0) || (!latLng.lng && latLng.lng !== 0)) {
                throw new Error("Pass { lat: lat, lng: lng } to S2.S2Cell.FromLatLng");
            }
            var xyz = S2.LatLngToXYZ(latLng);

            var faceuv = S2.XYZToFaceUV(xyz);
            var st = S2.UVToST(faceuv[1]);

            var ij = S2.STToIJ(st, level);

            return S2.S2Cell.FromFaceIJ(faceuv[0], ij, level);
        };

        S2.S2Cell.FromFaceIJ = function(face, ij, level) {
            var cell = new S2.S2Cell();
            cell.face = face;
            cell.ij = ij;
            cell.level = level;

            return cell;
        };


        S2.S2Cell.prototype.toString = function() {
            return 'F' + this.face + 'ij[' + this.ij[0] + ',' + this.ij[1] + ']@' + this.level;
        };

        S2.S2Cell.prototype.getLatLng = function() {
            var st = S2.IJToST(this.ij, this.level, [0.5, 0.5]);
            var uv = S2.STToUV(st);
            var xyz = S2.FaceUVToXYZ(this.face, uv);

            return S2.XYZToLatLng(xyz);
        };

        S2.S2Cell.prototype.getCornerLatLngs = function() {
            var result = [];
            var offsets = [
                [0.0, 0.0],
                [0.0, 1.0],
                [1.0, 1.0],
                [1.0, 0.0]
            ];

            for (var i = 0; i < 4; i++) {
                var st = S2.IJToST(this.ij, this.level, offsets[i]);
                var uv = S2.STToUV(st);
                var xyz = S2.FaceUVToXYZ(this.face, uv);

                result.push(S2.XYZToLatLng(xyz));
            }
            return result;
        };


        S2.S2Cell.prototype.getFaceAndQuads = function() {
            var quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level, this.face);

            return [this.face, quads];
        };
        S2.S2Cell.prototype.toHilbertQuadkey = function() {
            var quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level, this.face);

            return this.face.toString(10) + '/' + quads.join('');
        };

        S2.latLngToNeighborKeys = S2.S2Cell.latLngToNeighborKeys = function(lat, lng, level) {
            return S2.S2Cell.FromLatLng({
                lat: lat,
                lng: lng
            }, level).getNeighbors().map(function(cell) {
                return cell.toHilbertQuadkey();
            });
        };
        S2.S2Cell.prototype.getNeighbors = function() {

            var fromFaceIJWrap = function(face, ij, level) {
                var maxSize = (1 << level);
                if (ij[0] >= 0 && ij[1] >= 0 && ij[0] < maxSize && ij[1] < maxSize) {
                    // no wrapping out of bounds
                    return S2.S2Cell.FromFaceIJ(face, ij, level);
                } else {
                    // the new i,j are out of range.
                    // with the assumption that they're only a little past the borders we can just take the points as
                    // just beyond the cube face, project to XYZ, then re-create FaceUV from the XYZ vector

                    var st = S2.IJToST(ij, level, [0.5, 0.5]);
                    var uv = S2.STToUV(st);
                    var xyz = S2.FaceUVToXYZ(face, uv);
                    var faceuv = S2.XYZToFaceUV(xyz);
                    face = faceuv[0];
                    uv = faceuv[1];
                    st = S2.UVToST(uv);
                    ij = S2.STToIJ(st, level);
                    return S2.S2Cell.FromFaceIJ(face, ij, level);
                }
            };

            var face = this.face;
            var i = this.ij[0];
            var j = this.ij[1];
            var level = this.level;


            return [
                fromFaceIJWrap(face, [i - 1, j], level),
                fromFaceIJWrap(face, [i, j - 1], level),
                fromFaceIJWrap(face, [i + 1, j], level),
                fromFaceIJWrap(face, [i, j + 1], level)
            ];

        };

        //
        // Functional Style
        //
        S2.FACE_BITS = 3;
        S2.MAX_LEVEL = 30;
        S2.POS_BITS = (2 * S2.MAX_LEVEL) + 1; // 61 (60 bits of data, 1 bit lsb marker)

        S2.facePosLevelToId = S2.S2Cell.facePosLevelToId = S2.fromFacePosLevel = function(faceN, posS, levelN) {
            var Long = exports.dcodeIO && exports.dcodeIO.Long || require('long');
            var faceB;
            var posB;
            var bin;

            if (!levelN) {
                levelN = posS.length;
            }
            if (posS.length > levelN) {
                posS = posS.substr(0, levelN);
            }

            // 3-bit face value
            faceB = Long.fromString(faceN.toString(10), true, 10).toString(2);
            while (faceB.length < S2.FACE_BITS) {
                faceB = '0' + faceB;
            }

            // 60-bit position value
            posB = Long.fromString(posS, true, 4).toString(2);
            while (posB.length < (2 * levelN)) {
                posB = '0' + posB;
            }

            bin = faceB + posB;
            // 1-bit lsb marker
            bin += '1';
            // n-bit padding to 64-bits
            while (bin.length < (S2.FACE_BITS + S2.POS_BITS)) {
                bin += '0';
            }

            return Long.fromString(bin, true, 2).toString(10);
        };

        S2.keyToId = S2.S2Cell.keyToId = S2.toId = S2.toCellId = S2.fromKey = function(key) {
            var parts = key.split('/');

            return S2.fromFacePosLevel(parts[0], parts[1], parts[1].length);
        };

        S2.idToKey = S2.S2Cell.idToKey = S2.S2Cell.toKey = S2.toKey = S2.fromId = S2.fromCellId = S2.S2Cell.toHilbertQuadkey = S2.toHilbertQuadkey = function(idS) {
            var Long = exports.dcodeIO && exports.dcodeIO.Long || require('long');
            var bin = Long.fromString(idS, true, 10).toString(2);

            while (bin.length < (S2.FACE_BITS + S2.POS_BITS)) {
                bin = '0' + bin;
            }

            // MUST come AFTER binstr has been left-padded with '0's
            var lsbIndex = bin.lastIndexOf('1');
            // substr(start, len)
            // substring(start, end) // includes start, does not include end
            var faceB = bin.substring(0, 3);
            // posB will always be a multiple of 2 (or it's invalid)
            var posB = bin.substring(3, lsbIndex);
            var levelN = posB.length / 2;

            var faceS = Long.fromString(faceB, true, 2).toString(10);
            var posS = Long.fromString(posB, true, 2).toString(4);

            while (posS.length < levelN) {
                posS = '0' + posS;
            }

            return faceS + '/' + posS;
        };

        S2.keyToLatLng = S2.S2Cell.keyToLatLng = function(key) {
            var cell2 = S2.S2Cell.FromHilbertQuadKey(key);
            return cell2.getLatLng();
        };

        S2.idToLatLng = S2.S2Cell.idToLatLng = function(id) {
            var key = S2.idToKey(id);
            return S2.keyToLatLng(key);
        };

        S2.S2Cell.latLngToKey = S2.latLngToKey = S2.latLngToQuadkey = function(lat, lng, level) {
            if (isNaN(level) || level < 1 || level > 30) {
                throw new Error("'level' is not a number between 1 and 30 (but it should be)");
            }
            return S2.S2Cell.FromLatLng({
                lat: lat,
                lng: lng
            }, level).toHilbertQuadkey();
        };

        S2.stepKey = function(key, num) {
            var Long = exports.dcodeIO && exports.dcodeIO.Long || require('long');
            var parts = key.split('/');

            var faceS = parts[0];
            var posS = parts[1];
            var level = parts[1].length;

            var posL = Long.fromString(posS, true, 4);
            // TODO handle wrapping (0 === pos + 1)
            // (only on the 12 edges of the globe)
            var otherL;
            if (num > 0) {
                otherL = posL.add(Math.abs(num));
            } else if (num < 0) {
                otherL = posL.subtract(Math.abs(num));
            }
            var otherS = otherL.toString(4);

            if ('0' === otherS) {
                console.warning(new Error("face/position wrapping is not yet supported"));
            }

            while (otherS.length < level) {
                otherS = '0' + otherS;
            }

            return faceS + '/' + otherS;
        };

        S2.S2Cell.prevKey = S2.prevKey = function(key) {
            return S2.stepKey(key, -1);
        };

        S2.S2Cell.nextKey = S2.nextKey = function(key) {
            return S2.stepKey(key, 1);
        };

    })('undefined' !== typeof module ? module.exports : window);

}

init();