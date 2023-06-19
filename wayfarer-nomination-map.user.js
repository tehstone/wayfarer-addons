// ==UserScript==
// @name         Wayfarer Nomination Map
// @version      0.4.3
// @description  Add map of all nominations
// @namespace    https://github.com/tehstone/wayfarer-addons/
// @downloadURL  https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-map.user.js
// @homepageURL  https://github.com/tehstone/wayfarer-addons/
// @match        https://wayfarer.nianticlabs.com/*
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
    'use strict';
    let ctrlessZoom = true;
    let nomS2Cell = 14; 
    let nomS2Color = 'red';
    let nomSecondS2Cell = 17;
    let nomS2SecondColor = 'green';

    const colorMap = {
        "ACCEPTED": "green",
        "APPEALED": "purple",
        "NOMINATED": "blue",
        "WITHDRAWN": "grey",
        "VOTING": "yellow",
        "DUPLICATE": "orange",
        "REJECTED": "red",
    };

    const expectedStatuses = [
        "ACCEPTED",
        "APPEALED",
        "NOMINATED",
        "WITHDRAWN",
        "VOTING",
        "DUPLICATE",
        "REJECTED",
        "NIANTIC_REVIEW",
        "HELD",
        "upgraded",
        "upgradeNext"];

    function getIconUrl(nomination) {
        return `https://maps.google.com/mapfiles/ms/icons/${colorMap[nomination.status] || 'blue'}.png`;
    }

    let nominationMarkers = [];
    let nominationMap;
    let nominationCluster = null;

    let nominations;
    let countText;

    let statusSelectionMap = {};

    /**
     * Overwrite the open method of the XMLHttpRequest.prototype to intercept the server calls
     */
    (function (open) {
        XMLHttpRequest.prototype.open = function (method, url) {
            if (url == '/api/v1/vault/manage') {
                if (method == 'GET') {
                    this.addEventListener('load', parseNominations, false);
                }
            }
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    addCss();

    function parseNominations(e) {
        try {
            const response = this.response;
            const json = JSON.parse(response);
            if (!json) {
                alert('Failed to parse response from Wayfarer');
                return;
            }
            // ignore if it's related to captchas
            if (json.captcha)
                return;

            nominations = json.result.nominations;
            if (!nominations) {
                alert('Wayfarer\'s response didn\'t include nominations.');
                return;
            }
            addLoadSetting();
            addCounter();
            initPrimaryListener();
            initNominationMap();
            checkAutoLoad();

        } catch (e)    {
            console.log(e); // eslint-disable-line no-console
        }
    }

    function addCounter() {
        awaitElement(() => document.querySelector(".cdk-virtual-scroll-content-wrapper") ||
            document.querySelector(".mt-2")).then(ref => {
            const listEl = document.querySelector(".cdk-virtual-scroll-content-wrapper");
            const insDiv = document.querySelector(".mt-2");

            const searchInput = document.querySelector("input.w-full");
            if (searchInput !== undefined) {
                searchInput.addEventListener("keyup", debounce( () => {
                    updateMapFilter();
                }, 1000))
            }

            setTimeout(() => {
                const count = listEl["__ngContext__"][3][26].length;

                countText = document.createElement('div');
                countText.innerHTML = `Count: ${count}`;
                countText.classList.add("wayfarernm_text");
                insDiv.insertBefore(countText, insDiv.children[0]);
            }, 1000);
        });
    }

    function addMap(mapElement) {
        const mapSettings = ctrlessZoom ? {
            scrollwheel: true,
            gestureHandling: 'greedy'
        } : {};
        nominationMap = new google.maps.Map(mapElement, {
            zoom: 8,
            ...mapSettings,
        });
        updateMap(true);
    }

    function debounce(callback, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(function () { callback.apply(this, args); }, wait);
        };
    }

    function updateMapFilter() {
        if (countText !== undefined) {
            const listEl = document.querySelector(".cdk-virtual-scroll-content-wrapper");
            const count = listEl["__ngContext__"][3][26].length;
            nominations = listEl["__ngContext__"][3][26];
            countText.innerHTML = `Count: ${count}`;
            updateMap(true);
        }
        window.dispatchEvent(new Event("WFNM_MapFilterChange"));
    }

    function updateMap(reset) {
        if (nominationCluster !== null)
            nominationCluster.clearMarkers();

        const bounds = new google.maps.LatLngBounds();
        nominationMarkers = nominations.map((nomination) => {
            const latLng = {
                lat: nomination.lat,
                lng: nomination.lng
            };
            const marker = new google.maps.Marker({
                map: nominationMap,
                position: latLng,
                title: nomination.title,
                icon: {
                    url: getIconUrl(nomination)
                }
            });

            marker.addListener('click', () => {
                let inputs = document.querySelectorAll('input[type=text]');
                let input = inputs[0];
                input.value = nomination.title;
                input.dispatchEvent(new Event('input'));
                setTimeout(clickFirst, 500);
                setTimeout(() => {
                    console.log("calling updatemap with false")
                    updateMap(false)
                }, 500);
            });
            bounds.extend(latLng);
            return marker;
        });
        nominationCluster = new MarkerClusterer(nominationMap, nominationMarkers, {
            imagePath: "https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m",
            gridSize: 30,
            zoomOnClick: true,
            maxZoom: 10,
        });

        if (reset === true) {
            console.log("resetting bounds")
            nominationMap.fitBounds(bounds);
        }

        addS2Overlay(nominationMap, nomS2Cell, nomS2Color, nomSecondS2Cell, nomS2SecondColor);
    }

    function createElements() {
        const container = document.createElement('div');
        container.setAttribute('class', 'wrap-collabsible')
        container.id = "nomMap";

        const collapsibleInput = document.createElement("input");
        collapsibleInput.id = "collapsed-map";
        collapsibleInput.setAttribute("class", "toggle");
        collapsibleInput.type = "checkbox";

        const collapsibleLabel = document.createElement("label");
        collapsibleLabel.setAttribute("class", "lbl-toggle");
        collapsibleLabel.innerText = "View Nomination Map";
        collapsibleLabel.setAttribute("for", "collapsed-map");

        const collapsibleContent = document.createElement("div");
        collapsibleContent.setAttribute("class", "collapsible-content");

        const mapElement = document.createElement("div");
        mapElement.style = "height: 400px;";
        mapElement.setAttribute("class", "map-element");
        mapElement.innerText = "Loading...";
        mapElement.id = "nominationMap";

        collapsibleContent.appendChild(mapElement);

        container.appendChild(collapsibleInput);
        container.appendChild(collapsibleLabel);
        container.appendChild(collapsibleContent);

        const sectionElement = document.getElementsByTagName("app-nominations")[0];
        sectionElement.insertBefore(container, sectionElement.children[0]);

        return mapElement;
    }

    function initPrimaryListener() {
        awaitElement(() => document.querySelector(".cursor-pointer")).then(ref => {
            ref.addEventListener('click', function() {
            	const modal = document.getElementsByTagName("app-nominations-sort-modal");
                const els = modal[0].getElementsByClassName("wf-button--primary");
    	        for (let i = 0; i < els.length; i++) {
    	            els[i].addEventListener('click', function() {
                        setTimeout(updateMapFilter, 250);
    	            });
    	        }
            });
        });
    }

    function addLoadSetting() {
        awaitElement(() => document.querySelector(".cdk-virtual-scroll-content-wrapper")).then(ref => {
            const listEl = document.querySelector(".cdk-virtual-scroll-content-wrapper");
            const insDiv = document.querySelector(".mt-2");
            const userId = getUserId();

            let loadFirstChkbox = document.createElement("INPUT");
            loadFirstChkbox.setAttribute("type", "checkbox");

            loadFirstChkbox.id = 'wayfarernmloadfirstchkbox';

            const loadFirstChkboxLabel = document.createElement("label");
            loadFirstChkboxLabel.innerText = "Load first wayspot detail automatically:";
            loadFirstChkboxLabel.setAttribute("for", "wayfarernmloadfirstchkbox");

            insDiv.insertBefore(loadFirstChkbox, insDiv.children[0]);
            insDiv.insertBefore(loadFirstChkboxLabel, insDiv.children[0]);
            insDiv.insertBefore(document.createElement("br"), insDiv.children[0]);

            let loadFirst = localStorage.getItem(`wfnm_load_first_${userId}`);
            if (loadFirst === undefined || loadFirst === null || loadFirst === ""){
                loadFirst = true;
            }
            loadFirst = loadFirst === "true";

            if (loadFirst) {
                loadFirstChkbox.checked = true;
            }

            loadFirstChkbox.addEventListener('click', e => {
                localStorage.setItem(`wfnm_load_first_${userId}`, e.target.checked);
                console.log(e.target.checked);
            });
        });
    }

    function checkAutoLoad() {
        const userId = getUserId();
        let loadFirst = localStorage.getItem(`wfnm_load_first_${userId}`);
        if (loadFirst === undefined || loadFirst === null || loadFirst === ""){
            loadFirst = true;
        }
        loadFirst = loadFirst === "true";

        if (loadFirst) {
            clickFirst();
        }
    }

    function clickFirst() {
        awaitElement(() => document.getElementsByClassName("cdk-virtual-scroll-content-wrapper")).then(ref => {
            ref[0].children[0].click();
        });
    }

    function initNominationMap() {
        if (typeof(google) === 'undefined' || nominations === []) {
            setTimeout(initNominationMap, 250);
            return;
        }

        if (nominationMap == null) {
            let styleElem = document.createElement("STYLE");
            styleElem.innerText = ".customMapButton{display:inline-block;background:white;padding:5pt;border-radius:3pt;position:relative;margin:5pt;color:black;box-shadow:2pt 2pt 3pt grey;transition:box-shadow 0.2s;}.customMapButton:hover{background-color:#F0F0F0;color:black;box-shadow:1pt 1pt 3pt grey;}.wrap-collabsible{margin-bottom:1.2rem;}#collapsible, #collapsed-map{display:none;}.lbl-toggle{display:block;font-weight:bold;font-family:monospace;font-size:1.2rem;text-transform:uppercase;text-align:center;padding:1rem;color:white;background:#DF471C;cursor:pointer;border-radius:7px;transition:all 0.25s ease-out;}.lbl-toggle:hover{color:lightgrey;}.lbl-toggle::before{content:' ';display:inline-block;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:5px solid currentColor;vertical-align:middle;margin-right:.7rem;transform:translateY(-2px);transition:transform .2s ease-out;}.toggle:checked + .lbl-toggle::before{transform:rotate(90deg) translateX(-3px);}.collapsible-content{max-height:0px;overflow:hidden;transition:max-height .25s ease-in-out;}.toggle:checked + .lbl-toggle + .collapsible-content{max-height:9999999pt;}.toggle:checked + .lbl-toggle{border-bottom-right-radius:0;border-bottom-left-radius:0;}.collapsible-content .content-inner{border-bottom:1px solid rgba(0,0,0,1);border-left:1px solid rgba(0,0,0,1);border-right:1px solid rgba(0,0,0,1);border-bottom-left-radius:7px;border-bottom-right-radius:7px;padding:.5rem 1rem;}.content-inner td:last-child{text-align:right;}th, td{border:white solid 1pt;padding:1pt 5pt;}#statReload{float:right;}.dropbtn{background-color:#4CAF50;color:white;padding:16px;font-size:16px;border:none;cursor:pointer;}.mapsDropdown{float:left;background-color:white;border-radius:5px;box-shadow:grey 2px 2px 10px;margin-bottom:.5em;font-size:1.1em;color:black;padding:.25em;width:7em;text-align:center;}.dropdown-content{display:none;position:absolute;transform:translateY(-100%);border-radius:5px;background-color:#f9f9f9;min-width:160px;box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);z-index:9001;}.dropdown-content a{color:black;padding:12px 16px;text-decoration:none;display:block;}.dropdown-content a:hover{background-color:#f1f1f1 border-radius:5px;}.mapsDropdown:hover .dropdown-content{display:block;}.mapsDropdown:hover .dropbtn{background-color:#3e8e41;}#statsWidget{float:right;}#wfpNotify{position:absolute;bottom:1em;right:1em;width:30em;z-index:100;}.wfpNotification{border-radius:0.5em;background-color:#3e8e41CC;padding:1em;margin-top:1.5em;color:white;}.wfpNotifyCloseButton{float:right;}.theme--dark .collapsible-content .content-inner{color:white !important;border-bottom:1px solid white !important;border-left:1px solid white !important;border-right:1px solid white !important;}"
            document.getElementsByTagName("head")[0].appendChild(styleElem);
            addMap(createElements());
        } else {
            updateMap(true);
        } 
    }

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    function getStatsParent() {
        var els = document.getElementsByClassName("profile-stats__section-title");
        for (var i = 0; i < els.length; i++) {
               const element = els[i];
               if (element.innerHTML === "Agreements") {
                   return element;
               }
           }
           console.log("element not found");
           return null;
    }


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
            .wayfarernd {
                color: #333;
                margin: 5px 50px;
                padding: 5px 20px;
                text-align: left;
                font-size: 16px;
                background-color: #e5e5e5;
                border: 1px;
                border-radius: 3px;
                border-style: double;
                border-color: #ff4713;
                height: 25%
            }

            .wayfarercc__visible {
                display: block;
            }

            .dark .wayfarernd {
                color: #000000;
            }

            .wayfarercc__button {
                background-color: #e5e5e5;
                border: none;
                color: #ff4713;
                padding: 4px 10px;
                margin: 1px;
                text-align: center;
                text-decoration: none;
                display: inline-block;
                font-size: 16px;
            }

            .wayfarernm_text {
                  font-size: 18px;
              }

            .wrap-collabsible {
                margin-bottom: 1.2rem;
            }

            #collapsible,
            #collapsed-stats {
                display: none;
            }

            .lbl-toggle-ns {
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
            }

            .lbl-toggle-ns:hover {
                color: lightgrey;
            }

            .lbl-toggle-ns::before {
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

            .toggle:checked+.lbl-toggle-ns::before {
                transform: rotate(90deg) translateX(-3px);
            }

            .collapsible-content-ns {
                max-height: 0px;
                overflow: hidden;
                transition: max-height .25s ease-in-out;
            }

            .toggle:checked+.lbl-toggle-ns+.collapsible-content-ns {
                max-height: 9999999pt;
            }

            .toggle:checked+.lbl-toggle-ns {
                border-bottom-right-radius: 0;
                border-bottom-left-radius: 0;
            }

            .collapsible-content-ns .content-inner {
                border-bottom: 1px solid rgba(0, 0, 0, 1);
                border-left: 1px solid rgba(0, 0, 0, 1);
                border-right: 1px solid rgba(0, 0, 0, 1);
                border-bottom-left-radius: 7px;
                border-bottom-right-radius: 7px;
                padding: .5rem 1rem;
            }

            .content-inner td:last-child {
                text-align: right;
            }

            th,
            td {
                border: white solid 1pt;
                padding: 1pt 5pt;
            }
            `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.querySelector('head').appendChild(style);
    }


    // Marker Cluster
    /**
     * Copyright 2019 Google LLC. All Rights Reserved.
     *
     * Licensed under the Apache License, Version 2.0 (the "License");
     * you may not use this file except in compliance with the License.
     * You may obtain a copy of the License at
     *
     *      http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software
     * distributed under the License is distributed on an "AS IS" BASIS,
     * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
     * See the License for the specific language governing permissions and
     * limitations under the License.
     */

    /**
     * @name MarkerClusterer for Google Maps v3
     * @author Luke Mahe
     * @fileoverview
     * The library creates and manages per-zoom-level clusters for large amounts of
     * markers.
     */

    /**
     * A Marker Clusterer that clusters markers.
     *
     * @param {google.maps.Map} map The Google map to attach to.
     * @param {Array.<google.maps.Marker>=} opt_markers Optional markers to add to
     *   the cluster.
     * @param {Object=} opt_options support the following options:
     *     'gridSize': (number) The grid size of a cluster in pixels.
     *     'maxZoom': (number) The maximum zoom level that a marker can be part of a
     *                cluster.
     *     'zoomOnClick': (boolean) Whether the default behaviour of clicking on a
     *                    cluster is to zoom into it.
     *     'imagePath': (string) The base URL where the images representing
     *                  clusters will be found. The full URL will be:
     *                  {imagePath}[1-5].{imageExtension}
     *                  Default: '../images/m'.
     *     'imageExtension': (string) The suffix for images URL representing
     *                       clusters will be found. See _imagePath_ for details.
     *                       Default: 'png'.
     *     'averageCenter': (boolean) Whether the center of each cluster should be
     *                      the average of all markers in the cluster.
     *     'minimumClusterSize': (number) The minimum number of markers to be in a
     *                           cluster before the markers are hidden and a count
     *                           is shown.
     *     'zIndex': (number) the z-index of a cluster.
     *               Default: google.maps.Marker.MAX_ZINDEX + 1
     *     'styles': (Array.<Object>) An Array of single object that has style properties for all cluster:
     *       'url': (string) The image url.
     *       'height': (number) The image height.
     *       'width': (number) The image width.
     *       'anchor': (Array) The anchor position of the label text.
     *       'textColor': (string) The text color.
     *       'textSize': (number) The text size.
     *       'backgroundPosition': (string) The position of the backgound x, y.
     * @constructor
     * @extends google.maps.OverlayView
     */

    class MarkerClusterer {
        constructor(map, opt_markers, opt_options) {
            this.extend(MarkerClusterer, google.maps.OverlayView);
            this.map_ = map;

            /**
             * The marker cluster image path.
             *
             * @type {string}
             * @private
             */
            this.MARKER_CLUSTER_IMAGE_PATH_ = "../images/m";

            /**
             * The marker cluster image path.
             *
             * @type {string}
             * @private
             */
            this.MARKER_CLUSTER_IMAGE_EXTENSION_ = "png";
            /**
             * @type {Array.<google.maps.Marker>}
             * @private
             */
            this.markers_ = [];

            /**
             *  @type {Array.<Cluster>}
             */
            this.clusters_ = [];

            this.sizes = [53, 56, 66, 78, 90];

            /**
             * @type {Array.<Object>}
             * @private
             */
            this.styles_ = [];

            /**
             * @type {boolean}
             * @private
             */
            this.ready_ = false;

            var options = opt_options || {};

            /**
             * @type {number}
             */
            this.zIndex_ = options["zIndex"] || google.maps.Marker.MAX_ZINDEX + 1;

            /**
             * @type {number}
             * @private
             */
            this.gridSize_ = options["gridSize"] || 60;

            /**
             * @private
             */
            this.minClusterSize_ = options["minimumClusterSize"] || 2;

            /**
             * @type {?number}
             * @private
             */
            this.maxZoom_ = options["maxZoom"] || null;

            this.styles_ = options["styles"] || [];

            /**
             * @type {string}
             * @private
             */
            this.imagePath_ = options["imagePath"] || this.MARKER_CLUSTER_IMAGE_PATH_;

            /**
             * @type {string}
             * @private
             */
            this.imageExtension_ =
                options["imageExtension"] || this.MARKER_CLUSTER_IMAGE_EXTENSION_;

            /**
             * @type {boolean}
             * @private
             */
            this.zoomOnClick_ = true;

            if (options["zoomOnClick"] != undefined) {
                this.zoomOnClick_ = options["zoomOnClick"];
            }

            /**
             * @type {boolean}
             * @private
             */
            this.averageCenter_ = false;

            if (options["averageCenter"] != undefined) {
                this.averageCenter_ = options["averageCenter"];
            }

            this.setupStyles_();

            this.setMap(map);

            /**
             * @type {number}
             * @private
             */
            this.prevZoom_ = this.map_.getZoom();

            // Add the map event listeners
            var that = this;
            google.maps.event.addListener(this.map_, "zoom_changed", function() {
                // Determines map type and prevent illegal zoom levels
                var zoom = that.map_.getZoom();
                var minZoom = that.map_.minZoom || 0;
                var maxZoom = Math.min(
                    that.map_.maxZoom || 100,
                    that.map_.mapTypes[that.map_.getMapTypeId()].maxZoom
                );
                zoom = Math.min(Math.max(zoom, minZoom), maxZoom);

                if (that.prevZoom_ != zoom) {
                    that.prevZoom_ = zoom;
                    that.resetViewport();
                }
            });

            google.maps.event.addListener(this.map_, "idle", function() {
                that.redraw();
            });

            // Finally, add the markers
            if (
                opt_markers &&
                (opt_markers.length || Object.keys(opt_markers).length)
            ) {
                this.addMarkers(opt_markers, false);
            }
        }

        /**
         * Extends a objects prototype by anothers.
         *
         * @param {Object} obj1 The object to be extended.
         * @param {Object} obj2 The object to extend with.
         * @return {Object} The new extended object.
         * @ignore
         */
        extend(obj1, obj2) {
            return function(object) {
                for (var property in object.prototype) {
                    this.prototype[property] = object.prototype[property];
                }
                return this;
            }.apply(obj1, [obj2]);
        }

        /**
         * Implementaion of the interface method.
         * @ignore
         */
        onAdd() {
            this.setReady_(true);
        }

        /**
         * Implementaion of the interface method.
         * @ignore
         */
        draw() {}

        /**
         * Sets up the styles object.
         *
         * @private
         */
        setupStyles_() {
            if (this.styles_.length) {
                return;
            }

            for (var i = 0, size;
                (size = this.sizes[i]); i++) {
                this.styles_.push({
                    url: this.imagePath_ + (i + 1) + "." + this.imageExtension_,
                    height: size,
                    width: size
                });
            }
        }

        /**
         *  Fit the map to the bounds of the markers in the clusterer.
         */
        fitMapToMarkers() {
            var markers = this.getMarkers();
            var bounds = new google.maps.LatLngBounds();
            for (var i = 0, marker;
                (marker = markers[i]); i++) {
                bounds.extend(marker.getPosition());
            }

            this.map_.fitBounds(bounds);
        }

        /**
         * @param {number} zIndex
         */
        setZIndex(zIndex) {
            this.zIndex_ = zIndex;
        }

        /**
         * @return {number}
         */
        getZIndex() {
            return this.zIndex_;
        }

        /**
         *  Sets the styles.
         *
         *  @param {Object} styles The style to set.
         */
        setStyles(styles) {
            this.styles_ = styles;
        }

        /**
         *  Gets the styles.
         *
         *  @return {Object} The styles object.
         */
        getStyles() {
            return this.styles_;
        }

        /**
         * Whether zoom on click is set.
         *
         * @return {boolean} True if zoomOnClick_ is set.
         */
        isZoomOnClick() {
            return this.zoomOnClick_;
        }

        /**
         * Whether average center is set.
         *
         * @return {boolean} True if averageCenter_ is set.
         */
        isAverageCenter() {
            return this.averageCenter_;
        }

        /**
         *  Returns the array of markers in the clusterer.
         *
         *  @return {Array.<google.maps.Marker>} The markers.
         */
        getMarkers() {
            return this.markers_;
        }

        /**
         *  Returns the number of markers in the clusterer
         *
         *  @return {Number} The number of markers.
         */
        getTotalMarkers() {
            return this.markers_.length;
        }

        /**
         *  Sets the max zoom for the clusterer.
         *
         *  @param {number} maxZoom The max zoom level.
         */
        setMaxZoom(maxZoom) {
            this.maxZoom_ = maxZoom;
        }

        /**
         *  Gets the max zoom for the clusterer.
         *
         *  @return {number} The max zoom level.
         */
        getMaxZoom() {
            return this.maxZoom_;
        }

        /**
         *  The function for calculating the cluster icon image.
         *
         *  @param {Array.<google.maps.Marker>} markers The markers in the clusterer.
         *  @param {number} numStyles The number of styles available.
         *  @return {Object} A object properties: 'text' (string) and 'index' (number).
         *  @private
         */
        calculator_(markers, numStyles) {
            var index = 0;
            var count = markers.length;
            var dv = count;
            while (dv !== 0) {
                dv = parseInt(dv / 10, 10);
                index++;
            }

            index = Math.min(index, numStyles);
            return {
                text: count,
                index: index
            };
        }

        /**
         * Set the calculator function.
         *
         * @param {function(Array, number)} calculator The function to set as the
         *     calculator. The function should return a object properties:
         *     'text' (string) and 'index' (number).
         *
         */
        setCalculator(calculator) {
            this.calculator_ = calculator;
        }

        /**
         * Get the calculator function.
         *
         * @return {function(Array, number)} the calculator function.
         */
        getCalculator() {
            return this.calculator_;
        }

        /**
         * Add an array of markers to the clusterer.
         *
         * @param {Array.<google.maps.Marker>} markers The markers to add.
         * @param {boolean=} opt_nodraw Whether to redraw the clusters.
         */
        addMarkers(markers, opt_nodraw) {
            if (markers.length) {
                for (let i = 0, marker;
                    (marker = markers[i]); i++) {
                    this.pushMarkerTo_(marker);
                }
            } else if (Object.keys(markers).length) {
                for (let marker in markers) {
                    this.pushMarkerTo_(markers[marker]);
                }
            }
            if (!opt_nodraw) {
                this.redraw();
            }
        }

        /**
         * Pushes a marker to the clusterer.
         *
         * @param {google.maps.Marker} marker The marker to add.
         * @private
         */
        pushMarkerTo_(marker) {
            marker.isAdded = false;
            if (marker["draggable"]) {
                // If the marker is draggable add a listener so we update the clusters on
                // the drag end.
                var that = this;
                google.maps.event.addListener(marker, "dragend", function() {
                    marker.isAdded = false;
                    that.repaint();
                });
            }
            this.markers_.push(marker);
        }

        /**
         * Adds a marker to the clusterer and redraws if needed.
         *
         * @param {google.maps.Marker} marker The marker to add.
         * @param {boolean=} opt_nodraw Whether to redraw the clusters.
         */
        addMarker(marker, opt_nodraw) {
            this.pushMarkerTo_(marker);
            if (!opt_nodraw) {
                this.redraw();
            }
        }

        /**
         * Removes a marker and returns true if removed, false if not
         *
         * @param {google.maps.Marker} marker The marker to remove
         * @return {boolean} Whether the marker was removed or not
         * @private
         */
        removeMarker_(marker) {
            var index = -1;
            if (this.markers_.indexOf) {
                index = this.markers_.indexOf(marker);
            } else {
                for (var i = 0, m;
                    (m = this.markers_[i]); i++) {
                    if (m == marker) {
                        index = i;
                        break;
                    }
                }
            }

            if (index == -1) {
                // Marker is not in our list of markers.
                return false;
            }

            marker.setMap(null);

            this.markers_.splice(index, 1);

            return true;
        }

        /**
         * Remove a marker from the cluster.
         *
         * @param {google.maps.Marker} marker The marker to remove.
         * @param {boolean=} opt_nodraw Optional boolean to force no redraw.
         * @return {boolean} True if the marker was removed.
         */
        removeMarker(marker, opt_nodraw) {
            var removed = this.removeMarker_(marker);

            if (!opt_nodraw && removed) {
                this.resetViewport();
                this.redraw();
                return true;
            } else {
                return false;
            }
        }

        /**
         * Removes an array of markers from the cluster.
         *
         * @param {Array.<google.maps.Marker>} markers The markers to remove.
         * @param {boolean=} opt_nodraw Optional boolean to force no redraw.
         */
        removeMarkers(markers, opt_nodraw) {
            // create a local copy of markers if required
            // (removeMarker_ modifies the getMarkers() array in place)
            var markersCopy = markers === this.getMarkers() ? markers.slice() : markers;
            var removed = false;

            for (var i = 0, marker;
                (marker = markersCopy[i]); i++) {
                var r = this.removeMarker_(marker);
                removed = removed || r;
            }

            if (!opt_nodraw && removed) {
                this.resetViewport();
                this.redraw();
                return true;
            }
        }

        /**
         * Sets the clusterer's ready state.
         *
         * @param {boolean} ready The state.
         * @private
         */
        setReady_(ready) {
            if (!this.ready_) {
                this.ready_ = ready;
                this.createClusters_();
            }
        }

        /**
         * Returns the number of clusters in the clusterer.
         *
         * @return {number} The number of clusters.
         */
        getTotalClusters() {
            return this.clusters_.length;
        }

        /**
         * Returns the google map that the clusterer is associated with.
         *
         * @return {google.maps.Map} The map.
         */
        getMap() {
            return this.map_;
        }

        /**
         * Sets the google map that the clusterer is associated with.
         *
         * @param {google.maps.Map} map The map.
         */
        setMap(map) {
            this.map_ = map;
        }

        /**
         * Returns the size of the grid.
         *
         * @return {number} The grid size.
         */
        getGridSize() {
            return this.gridSize_;
        }

        /**
         * Sets the size of the grid.
         *
         * @param {number} size The grid size.
         */
        setGridSize(size) {
            this.gridSize_ = size;
        }

        /**
         * Returns the min cluster size.
         *
         * @return {number} The grid size.
         */
        getMinClusterSize() {
            return this.minClusterSize_;
        }

        /**
         * Sets the min cluster size.
         *
         * @param {number} size The grid size.
         */
        setMinClusterSize(size) {
            this.minClusterSize_ = size;
        }

        /**
         * Extends a bounds object by the grid size.
         *
         * @param {google.maps.LatLngBounds} bounds The bounds to extend.
         * @return {google.maps.LatLngBounds} The extended bounds.
         */
        getExtendedBounds(bounds) {
            var projection = this.getProjection();

            // Turn the bounds into latlng.
            var tr = new google.maps.LatLng(
                bounds.getNorthEast().lat(),
                bounds.getNorthEast().lng()
            );
            var bl = new google.maps.LatLng(
                bounds.getSouthWest().lat(),
                bounds.getSouthWest().lng()
            );

            // Convert the points to pixels and the extend out by the grid size.
            var trPix = projection.fromLatLngToDivPixel(tr);
            trPix.x += this.gridSize_;
            trPix.y -= this.gridSize_;

            var blPix = projection.fromLatLngToDivPixel(bl);
            blPix.x -= this.gridSize_;
            blPix.y += this.gridSize_;

            // Convert the pixel points back to LatLng
            var ne = projection.fromDivPixelToLatLng(trPix);
            var sw = projection.fromDivPixelToLatLng(blPix);

            // Extend the bounds to contain the new bounds.
            bounds.extend(ne);
            bounds.extend(sw);

            return bounds;
        }

        /**
         * Determins if a marker is contained in a bounds.
         *
         * @param {google.maps.Marker} marker The marker to check.
         * @param {google.maps.LatLngBounds} bounds The bounds to check against.
         * @return {boolean} True if the marker is in the bounds.
         * @private
         */
        isMarkerInBounds_(marker, bounds) {
            return bounds.contains(marker.getPosition());
        }

        /**
         * Clears all clusters and markers from the clusterer.
         */
        clearMarkers() {
            this.resetViewport(true);

            // Set the markers a empty array.
            this.markers_ = [];
        }

        /**
         * Clears all existing clusters and recreates them.
         * @param {boolean} opt_hide To also hide the marker.
         */
        resetViewport(opt_hide) {
            // Remove all the clusters
            for (let i = 0, cluster;
                (cluster = this.clusters_[i]); i++) {
                cluster.remove();
            }

            // Reset the markers to not be added and to be invisible.
            for (let i = 0, marker;
                (marker = this.markers_[i]); i++) {
                marker.isAdded = false;
                if (opt_hide) {
                    marker.setMap(null);
                }
            }

            this.clusters_ = [];
        }

        /**
         *
         */
        repaint() {
            var oldClusters = this.clusters_.slice();
            this.clusters_.length = 0;
            this.resetViewport();
            this.redraw();

            // Remove the old clusters.
            // Do it in a timeout so the other clusters have been drawn first.
            setTimeout(function() {
                for (var i = 0, cluster;
                    (cluster = oldClusters[i]); i++) {
                    cluster.remove();
                }
            }, 0);
        }

        /**
         * Redraws the clusters.
         */
        redraw() {
            this.createClusters_();
        }

        /**
         * Calculates the distance between two latlng locations in km.
         * @see http://www.movable-type.co.uk/scripts/latlong.html
         *
         * @param {google.maps.LatLng} p1 The first lat lng point.
         * @param {google.maps.LatLng} p2 The second lat lng point.
         * @return {number} The distance between the two points in km.
         * @private
         */
        distanceBetweenPoints_(p1, p2) {
            if (!p1 || !p2) {
                return 0;
            }

            var R = 6371; // Radius of the Earth in km
            var dLat = ((p2.lat() - p1.lat()) * Math.PI) / 180;
            var dLon = ((p2.lng() - p1.lng()) * Math.PI) / 180;
            var a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos((p1.lat() * Math.PI) / 180) *
                Math.cos((p2.lat() * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            var d = R * c;
            return d;
        }

        /**
         * Add a marker to a cluster, or creates a new cluster.
         *
         * @param {google.maps.Marker} marker The marker to add.
         * @private
         */
        addToClosestCluster_(marker) {
            var distance = 40000; // Some large number
            var clusterToAddTo = null;
            for (var i = 0, cluster;
                (cluster = this.clusters_[i]); i++) {
                var center = cluster.getCenter();
                if (center) {
                    var d = this.distanceBetweenPoints_(center, marker.getPosition());
                    if (d < distance) {
                        distance = d;
                        clusterToAddTo = cluster;
                    }
                }
            }

            if (clusterToAddTo && clusterToAddTo.isMarkerInClusterBounds(marker)) {
                clusterToAddTo.addMarker(marker);
            } else {
                var newCluster = new Cluster(this);
                newCluster.addMarker(marker);
                this.clusters_.push(newCluster);
            }
        }

        /**
         * Creates the clusters.
         *
         * @private
         */
        createClusters_() {
            if (!this.ready_) {
                return;
            }

            // Get our current map view bounds.
            // Create a new bounds object so we don't affect the map.
            var mapBounds = new google.maps.LatLngBounds(
                this.map_.getBounds().getSouthWest(),
                this.map_.getBounds().getNorthEast()
            );
            var bounds = this.getExtendedBounds(mapBounds);

            for (var i = 0, marker;
                (marker = this.markers_[i]); i++) {
                if (!marker.isAdded && this.isMarkerInBounds_(marker, bounds)) {
                    this.addToClosestCluster_(marker);
                }
            }
        }
    }

    /**
     * A cluster that contains markers.
     *
     * @param {MarkerClusterer} markerClusterer The markerclusterer that this
     *     cluster is associated with.
     * @constructor
     * @ignore
     */
    class Cluster {
        constructor(markerClusterer) {
            this.markerClusterer_ = markerClusterer;
            this.map_ = markerClusterer.getMap();
            this.gridSize_ = markerClusterer.getGridSize();
            this.minClusterSize_ = markerClusterer.getMinClusterSize();
            this.averageCenter_ = markerClusterer.isAverageCenter();
            this.center_ = null;
            this.markers_ = [];
            this.bounds_ = null;
            this.clusterIcon_ = new ClusterIcon(
                this,
                markerClusterer.getStyles(),
                markerClusterer.getGridSize()
            );
        }

        /**
         * Determins if a marker is already added to the cluster.
         *
         * @param {google.maps.Marker} marker The marker to check.
         * @return {boolean} True if the marker is already added.
         */
        isMarkerAlreadyAdded(marker) {
            if (this.markers_.indexOf) {
                return this.markers_.indexOf(marker) != -1;
            } else {
                for (var i = 0, m;
                    (m = this.markers_[i]); i++) {
                    if (m == marker) {
                        return true;
                    }
                }
            }
            return false;
        }

        /**
         * Add a marker the cluster.
         *
         * @param {google.maps.Marker} marker The marker to add.
         * @return {boolean} True if the marker was added.
         */
        addMarker(marker) {
            if (this.isMarkerAlreadyAdded(marker)) {
                return false;
            }

            if (!this.center_) {
                this.center_ = marker.getPosition();
                this.calculateBounds_();
            } else {
                if (this.averageCenter_) {
                    var l = this.markers_.length + 1;
                    var lat =
                        (this.center_.lat() * (l - 1) + marker.getPosition().lat()) / l;
                    var lng =
                        (this.center_.lng() * (l - 1) + marker.getPosition().lng()) / l;
                    this.center_ = new google.maps.LatLng(lat, lng);
                    this.calculateBounds_();
                }
            }

            marker.isAdded = true;
            this.markers_.push(marker);

            var len = this.markers_.length;
            if (len < this.minClusterSize_ && marker.getMap() != this.map_) {
                // Min cluster size not reached so show the marker.
                marker.setMap(this.map_);
            }

            if (len == this.minClusterSize_) {
                // Hide the markers that were showing.
                for (var i = 0; i < len; i++) {
                    this.markers_[i].setMap(null);
                }
            }

            if (len >= this.minClusterSize_) {
                marker.setMap(null);
            }

            this.updateIcon();
            return true;
        }

        /**
         * Returns the marker clusterer that the cluster is associated with.
         *
         * @return {MarkerClusterer} The associated marker clusterer.
         */
        getMarkerClusterer() {
            return this.markerClusterer_;
        }

        /**
         * Returns the bounds of the cluster.
         *
         * @return {google.maps.LatLngBounds} the cluster bounds.
         */
        getBounds() {
            var bounds = new google.maps.LatLngBounds(this.center_, this.center_);
            var markers = this.getMarkers();
            for (var i = 0, marker;
                (marker = markers[i]); i++) {
                bounds.extend(marker.getPosition());
            }
            return bounds;
        }

        /**
         * Removes the cluster
         */
        remove() {
            this.clusterIcon_.remove();
            this.markers_.length = 0;
            delete this.markers_;
        }

        /**
         * Returns the number of markers in the cluster.
         *
         * @return {number} The number of markers in the cluster.
         */
        getSize() {
            return this.markers_.length;
        }

        /**
         * Returns a list of the markers in the cluster.
         *
         * @return {Array.<google.maps.Marker>} The markers in the cluster.
         */
        getMarkers() {
            return this.markers_;
        }

        /**
         * Returns the center of the cluster.
         *
         * @return {google.maps.LatLng} The cluster center.
         */
        getCenter() {
            return this.center_;
        }

        /**
         * Calculated the extended bounds of the cluster with the grid.
         *
         * @private
         */
        calculateBounds_() {
            var bounds = new google.maps.LatLngBounds(this.center_, this.center_);
            this.bounds_ = this.markerClusterer_.getExtendedBounds(bounds);
        }

        /**
         * Determines if a marker lies in the clusters bounds.
         *
         * @param {google.maps.Marker} marker The marker to check.
         * @return {boolean} True if the marker lies in the bounds.
         */
        isMarkerInClusterBounds(marker) {
            return this.bounds_.contains(marker.getPosition());
        }

        /**
         * Returns the map that the cluster is associated with.
         *
         * @return {google.maps.Map} The map.
         */
        getMap() {
            return this.map_;
        }

        /**
         * Updates the cluster icon
         */
        updateIcon() {
            var zoom = this.map_.getZoom();
            var mz = this.markerClusterer_.getMaxZoom();

            if (mz && zoom > mz) {
                // The zoom is greater than our max zoom so show all the markers in cluster.
                for (var i = 0, marker;
                    (marker = this.markers_[i]); i++) {
                    marker.setMap(this.map_);
                }
                return;
            }

            if (this.markers_.length < this.minClusterSize_) {
                // Min cluster size not yet reached.
                this.clusterIcon_.hide();
                return;
            }

            var numStyles = this.markerClusterer_.getStyles().length;
            var sums = this.markerClusterer_.getCalculator()(this.markers_, numStyles);
            this.clusterIcon_.setCenter(this.center_);
            this.clusterIcon_.setSums(sums);
            this.clusterIcon_.show();
        }
    }

    /**
     * A cluster icon
     *
     * @param {Cluster} cluster The cluster to be associated with.
     * @param {Object} styles An object that has style properties:
     *     'url': (string) The image url.
     *     'height': (number) The image height.
     *     'width': (number) The image width.
     *     'anchor': (Array) The anchor position of the label text.
     *     'textColor': (string) The text color.
     *     'textSize': (number) The text size.
     *     'backgroundPosition: (string) The background postition x, y.
     * @param {number=} opt_padding Optional padding to apply to the cluster icon.
     * @constructor
     * @extends google.maps.OverlayView
     * @ignore
     */
    class ClusterIcon {
        constructor(cluster, styles, opt_padding) {
            cluster.getMarkerClusterer().extend(ClusterIcon, google.maps.OverlayView);

            this.styles_ = styles;
            this.padding_ = opt_padding || 0;
            this.cluster_ = cluster;
            this.center_ = null;
            this.map_ = cluster.getMap();
            this.div_ = null;
            this.sums_ = null;
            this.visible_ = false;

            this.setMap(this.map_);
        }

        /**
         * Triggers the clusterclick event and zoom's if the option is set.
         */
        triggerClusterClick() {
            var clusterBounds = this.cluster_.getBounds();
            var markerClusterer = this.cluster_.getMarkerClusterer();

            // Trigger the clusterclick event.
            google.maps.event.trigger(
                markerClusterer.map_,
                "clusterclick",
                this.cluster_
            );

            if (markerClusterer.isZoomOnClick()) {
                // Zoom into the cluster.
                this.map_.fitBounds(clusterBounds);
                this.map_.setCenter(clusterBounds.getCenter());
            }
        }

        /**
         * Adding the cluster icon to the dom.
         * @ignore
         */
        onAdd() {
            this.div_ = document.createElement("DIV");
            if (this.visible_) {
                var pos = this.getPosFromLatLng_(this.center_);
                this.div_.style.cssText = this.createCss(pos);
                this.div_.innerHTML = this.sums_.text;
            }

            var panes = this.getPanes();
            panes.overlayMouseTarget.appendChild(this.div_);

            var that = this;
            google.maps.event.addDomListener(this.div_, "click", function() {
                that.triggerClusterClick();
            });
        }

        /**
         * Returns the position to place the div dending on the latlng.
         *
         * @param {google.maps.LatLng} latlng The position in latlng.
         * @return {google.maps.Point} The position in pixels.
         * @private
         */
        getPosFromLatLng_(latlng) {
            var pos = this.getProjection().fromLatLngToDivPixel(latlng);
            pos.x -= parseInt(this.width_ / 2, 10);
            pos.y -= parseInt(this.height_ / 2, 10);
            return pos;
        }

        /**
         * Draw the icon.
         * @ignore
         */
        draw() {
            if (this.visible_) {
                var pos = this.getPosFromLatLng_(this.center_);
                this.div_.style.top = pos.y + "px";
                this.div_.style.left = pos.x + "px";
            }
        }

        /**
         * Hide the icon.
         */
        hide() {
            if (this.div_) {
                this.div_.style.display = "none";
            }
            this.visible_ = false;
        }

        /**
         * Position and show the icon.
         */
        show() {
            if (this.div_) {
                var pos = this.getPosFromLatLng_(this.center_);
                this.div_.style.cssText = this.createCss(pos);
                this.div_.style.display = "";
            }
            this.visible_ = true;
        }

        /**
         * Remove the icon from the map
         */
        remove() {
            this.setMap(null);
        }

        /**
         * Implementation of the onRemove interface.
         * @ignore
         */
        onRemove() {
            if (this.div_ && this.div_.parentNode) {
                this.hide();
                this.div_.parentNode.removeChild(this.div_);
                this.div_ = null;
            }
        }

        /**
         * Set the sums of the icon.
         *
         * @param {Object} sums The sums containing:
         *   'text': (string) The text to display in the icon.
         *   'index': (number) The style index of the icon.
         */
        setSums(sums) {
            this.sums_ = sums;
            this.text_ = sums.text;
            this.index_ = sums.index;
            if (this.div_) {
                this.div_.innerHTML = sums.text;
            }

            this.useStyle();
        }

        /**
         * Sets the icon to the the styles.
         */
        useStyle() {
            var index = Math.max(0, this.sums_.index - 1);
            index = Math.min(this.styles_.length - 1, index);
            var style = this.styles_[index];
            this.url_ = style["url"];
            this.height_ = style["height"];
            this.width_ = style["width"];
            this.textColor_ = style["textColor"];
            this.anchor_ = style["anchor"];
            this.textSize_ = style["textSize"];
            this.backgroundPosition_ = style["backgroundPosition"];
        }

        /**
         * Sets the center of the icon.
         *
         * @param {google.maps.LatLng} center The latlng to set as the center.
         */
        setCenter(center) {
            this.center_ = center;
        }

        /**
         * Create the css text based on the position of the icon.
         *
         * @param {google.maps.Point} pos The position.
         * @return {string} The css style text.
         */
        createCss(pos) {
            var style = [];
            style.push("z-index:" + this.cluster_.markerClusterer_.getZIndex() + ";");
            style.push("background-image:url(" + this.url_ + ");");
            var backgroundPosition = this.backgroundPosition_ ?
                this.backgroundPosition_ :
                "0 0";
            style.push("background-position:" + backgroundPosition + ";");

            if (typeof this.anchor_ === "object") {
                if (
                    typeof this.anchor_[0] === "number" &&
                    this.anchor_[0] > 0 &&
                    this.anchor_[0] < this.height_
                ) {
                    style.push(
                        "height:" +
                        (this.height_ - this.anchor_[0]) +
                        "px; padding-top:" +
                        this.anchor_[0] +
                        "px;"
                    );
                } else {
                    style.push(
                        "height:" + this.height_ + "px; line-height:" + this.height_ + "px;"
                    );
                }
                if (
                    typeof this.anchor_[1] === "number" &&
                    this.anchor_[1] > 0 &&
                    this.anchor_[1] < this.width_
                ) {
                    style.push(
                        "width:" +
                        (this.width_ - this.anchor_[1]) +
                        "px; padding-left:" +
                        this.anchor_[1] +
                        "px;"
                    );
                } else {
                    style.push("width:" + this.width_ + "px; text-align:center;");
                }
            } else {
                style.push(
                    "height:" +
                    this.height_ +
                    "px; line-height:" +
                    this.height_ +
                    "px; width:" +
                    this.width_ +
                    "px; text-align:center;"
                );
            }

            var txtColor = this.textColor_ ? this.textColor_ : "black";
            var txtSize = this.textSize_ ? this.textSize_ : 11;

            style.push(
                "cursor:pointer; top:" +
                pos.y +
                "px; left:" +
                pos.x +
                "px; color:" +
                txtColor +
                "; position:absolute; font-size:" +
                txtSize +
                "px; font-family:Arial,sans-serif; font-weight:bold"
            );
            return style.join("");
        }
    }

    window.MarkerClusterer = MarkerClusterer;
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

    function addS2Overlay(map, gridLevel, col, secondGridLevel, secondCol) {
        let overlay = new S2Overlay();

        //To make sure bigger cells are always drawn on top of smaller cells regardless of user config order
        //If they are equal draw order doesn't matter
        let smallGridLevel, bigGridLevel, smallCol, bigCol;
        if (gridLevel > secondGridLevel) { //eg. L14 cells are bigger than L15 cells
            smallGridLevel = gridLevel;
            smallCol = col;
            bigGridLevel = secondGridLevel;
            bigCol = secondCol;
        } else {
            smallGridLevel = secondGridLevel;
            smallCol = secondCol;
            bigGridLevel = gridLevel;
            bigCol = col;
        }

        overlay.drawCellGrid(map, smallGridLevel, smallCol);
        overlay.drawCellGrid(map, bigGridLevel, bigCol, 2);

        map.addListener('idle', () => {
            overlay.updateGrid(map, smallGridLevel, smallCol, bigGridLevel, bigCol);
        });
    }
}

init();

