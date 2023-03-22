# wayfarer-addons

This is a collection of plugins with the Wayfarer Review website which augment the experience in various ways. 
Each plugin will work independently or along side the rest so users can customize their Wayfarer experience.

For feedback, help, or any other conversation about these scripts please join the [Wayfarer Discussion Discord](https://discord.gg/DvDCRXcvxG) -> #tools-chat channel. 

[Tampermonkey](https://tampermonkey.net/) is required in order to install these plugins, then each can be installed via the link below.

# Keyboard Review
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-keyboard-review.user.js)

This plugin enables nearly full control of the review page via the keyboard.

- Numbers 1-5 to select a rating for the selected category
- Left & Right arrows to navigate between categories
- Enter key to submit the nomination (will select the Smart Submit option of the Review Timer script is installed).
- Numbers within Rejection Dialog to navigate the reject reason menu
- Backspace within Rejection Dialog to navigate back a level in the reject reason menu
- When the text box in the Rejection Dialog is focused, Shift+Enter will add a newline, Enter will submit the nomination
- Whenever the submit button is active, Ctrl+Enter will select the "Submit and finish reviewing" option
- "D" to jump to the duplicate selection panel
- "A-Z" to select a nearby wayspot as a duplicate then Enter to select it
- "Q" to open/close the main photo
- "E" to open/close the supporting photo
- "R" & "F" to zoom in and out of the map
- If the Location Accuracy rating is focused, "Escape" will exit street view
- Number keys to select Edit options
- Letter keys to select photo options

# Review Timer with Smart Submit
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-timer.user.js)

Adds a timer to the top of the page indicating the time remaining to review the current nomination.

Adds a Smart Submit button that will wait to submit the nomination until a certain amount of time has elapsed. The minimum and maximum wait times are configurable and a random value between the min and max will be selected each time the button is pressed. The nomination will be submitted once that amount of time has elapsed on the timer.

Smart Submit button can be disabled if desired, a toggle for the button as well as the min and max delays mentioned previously are all found within a new settings panel at the bottom of the review page.

# Review Map Mods
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-map-mods.user.js)

- Sets a more reasonable default zoom level when the map first loads
- Adds a default setting for the map type with Streetview, satellite, and map options
    - When Streetview is selected but no imagery is available within 50m, it will fall back to satellite and display a warning.
- Adds an option S2 grid overlay with configurable size and colors plus optional second grid display
- Adds circles for minimum edit distance and 20m range when selecting a new location for the nomination pin
- Adds hover-over tooltips to each marker on the map to display its name


# Review Counter
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-counter.user.js)

Adds a counter to the top of the page which increments for each review completed during the current session.

# Edits Diff
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-edits-diff.user.js)

Highlights the differences in text for title and description edits that are similar to the original.

# Extended Stats
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-extended-stats.user.js)

- Adds total agreement count and percentage to the Profile Page
- Includes settings to indicate whether agreements should be calculated from the Badge Stat in Pokemon GO, based on Upgrade Count, or a simple accepted + rejected + duplicate count
- Includes settings for current Badge Count and Bonus Upgrades Earned count

# Review History
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-history-idb.user.js)
~~[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-history.user.js)~~

- Stores review history for New Nominations, Edit Nominations, and Photo Reviews per user
- Includes Export, Import, and Clear options
- Includes filtering options for import including an oldest date, and location/range options.
* Note: there is a newer implementation of this script than what was previously available which will no longer run out of storage. Use the first link above unless you have a good reason to use the older version. The older version does not have several of the features listed above.

# Review History Table
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-history-table.user.js)

Adds a searchable and sortable table to the Profile page with all review history stored by the Review History IDB add on.

# Nomination Map 
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-map.user.js)

Places a map of all player nominations at the top of the Nominations Page. Also places a counter of the currently listed nominations above the list, this counter updates whenever the search or filter is updated.

# Nomination Streetview
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-streetview.user.js)

Adds a Streetview panel to the selected nomination, also makes the Nomination Title a link to intel and adds click-to-copy GPS coordinates to the location.

# Nomination Stats
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-stats.user.js)

Basic stats about nominations. Export in JSON or CSV for all nominations.

# Nomination Status History
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-status-history.user.js)

Tracks all changes to the status of each nomination. Changes are only detected when the Contributions page is loaded and no history is available prior to the installation of this add on.

# Nomination Types
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-types.user.js)

Provides a selector to indicate which game a nomination was made with. This data is not available so selection must be done manually.

# Rejections Plus
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-rejections-plus.user.js)

Stores all rejection reasons for each nomination. This is to overcome a bug that causes only 2 of the rejection reasons to load each time the page is refreshed. All previously detected reasons will be displayed along with the full text description of that rejection reason.

# Ticket Saver
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-ticket-saver.user.js)

Stores all previously opened help chat tickets and adds a tab to the left nav to view these tickets.

# Open In
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-open-in.user.js)

Adds direct links to external map providers wherever maps are displayed in Wayfarer. The following providers are supported globally:

- Google Maps
- OpenStreetMap
- Ingress Intel
- Bing Maps
- Yandex.Maps

In addition to these providers, the plugin adds support for 52 regional map providers across 38 countries. Depending on the location of the wayspot, you may also see some of these map providers, many of which offer very high quality features such as high-resolution aerial imagery, property boundaries or street view:

<details>
    <summary>List of regional map providers</summary>

*Map providers marked with \* are experimental*

- 🇦🇹 **Austria:** eBOD, Geoland\*
- 🇦🇺 **Australia:** NSW Imagery
    - **New South Wales:** NSW Imagery
    - **South Australia:** Location SA Viewer
    - **Western Australia:** Landgate Map Viewer Plus
- 🇦🇽 **Åland Islands:** Maanmittauslaitos, Paikkatietoikkuna
- 🇧🇦 **Bosnia and Herzegovina:** Kadastar.ba\*
- 🇧🇪 **Belgium:** NGI/IGN
- 🇧🇯 **Benin:** IGN Bénin\*
- 🇧🇱 **Saint Barthélemy:** Mappy
- 🇨🇭 **Switzerland:** Admin.ch
- 🇨🇿 **Czech Republic:** Mapy.cz
- 🇩🇪 **Germany:**
    - **Baden-Württemberg:** Geoportal BW\*
    - **Bavaria:** BayernAtlas
    - **Berlin:** FIS-Broker
    - **Bremen:** GeoPortal Bremen, Geoportal der Metropolregion Hamburg, Hamburg Geo-Online
    - **Hamburg:** Geoportal der Metropolregion Hamburg, Hamburg Geo-Online
    - **Lower Saxony:** GeobasisdatenViewer Niedersachsen
    - **Mecklenburg-Western Pomerania:** GAIA-MV, ORKa.MV
    - **Rhineland-Palatinate:** GeoBasisViewer RLP
    - **Saxony-Anhalt:** Sachsen-Anhalt-Viewer
    - **Schleswig-Holstein:** Hamburg Geo-Online
    - **Thuringia:** Thüringen Viewer
- 🇩🇰 **Denmark:** Find vej, Krak, SDFE Skråfoto
- 🇪🇦 **Ceuta & Melilla:** Fototeca Digital, Iberpix
- 🇪🇪 **Estonia:** BalticMaps, Maa-amet Fotoladu, Maainfo
- 🇪🇸 **Spain:** Fototeca Digital, Iberpix
- 🇫🇮 **Finland:** Maanmittauslaitos, Paikkatietoikkuna
- 🇫🇴 **Faroe Islands:** Flogmyndir, Føroyakort
- 🇫🇷 **France:** Mappy
- 🇬🇫 **French Guiana:** Mappy
- 🇬🇮 **Gibraltar:** Fototeca Digital, Iberpix
- 🇬🇵 **Guadeloupe:** Mappy
- 🇭🇷 **Croatia:** Geoportal DGU
- 🇮🇨 **Canary Islands:** Fototeca Digital, Iberpix
- 🇮🇩 **Indonesia:** Badan Informasi Geospasial
- 🇮🇱 **Israel:** Govmap
- 🇮🇸 **Iceland:** Já.is Götusýn, Landupplýsingagátt LMÍ, Map.is, Samsýn
- 🇮🇹 **Italy:** Geoportale Nazionale\*
- 🇰🇷 **South Korea:** Kakao, Naver
- 🇱🇮 **Liechtenstein:** Admin.ch, Geodatenportal der LLV
- 🇱🇹 **Lithuania:** Geoportal.lt, Maps.lt
- 🇱🇺 **Luxembourg:** Geoportal Luxembourg
- 🇱🇻 **Latvia:** BalticMaps, LĢIA Kartes
- 🇲🇨 **Monaco:** Mappy
- 🇲🇫 **Saint Martin:** Mappy
- 🇲🇶 **Martinique:** Mappy
- 🇲🇹 **Malta:** Planning Authority\*
- 🇳🇱 **Netherlands:** Kaarten van Nederland, Map5 NLTopo
- 🇳🇴 **Norway:** Gule Sider, Kommunekart, Norge i bilder, Norgeskart, UT.no
- 🇳🇿 **New Zealand:** Land Information NZ
- 🇵🇱 **Poland:** Geoportal
- 🇵🇲 **Saint Pierre and Miquelon:** Mappy
- 🇵🇸 **Palestinian Territories:**
    - **West Bank:** Govmap
- 🇷🇪 **Réunion:** Mappy
- 🇷🇸 **Serbia:** МРЕ Србије
- 🇸🇨 **Seychelles:** MHILT WebGIS\*
- 🇸🇪 **Sweden:** Eniro, Lantmäteriet
- 🇸🇬 **Singapore:** OneMap3D\*
- 🇸🇯 **Svalbard and Jan Mayen:**
    - **Svalbard:** TopoSvalbard
- 🇸🇰 **Slovakia:** Mapy.cz
- 🇸🇲 **San Marino:** Geoportale Nazionale\*
- 🇸🇽 **Sint Maarten:** Mappy
- 🇻🇦 **Vatican City:** Geoportale Nazionale\*
- 🇼🇫 **Wallis and Futuna:** Mappy
- 🇽🇰 **Kosovo:** МРЕ Србије
- 🇾🇹 **Mayotte:** Mappy

</details>

These are automatically made available to you in each respective region.

# Compact View
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-compact-card.user.js)

Removes unnecessary sentences, reduced font size for title/descriptions, automatically defaults all three What is it categories to **NO**. Not necessarily compact.

# Version Display
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-version-display.user.js)

Displays the current Wayfarer code version in the upper left of the page.


# Localstorage Check
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-localstoragecheck.user.js)

On each page load, checks the current amount of data in localstorage and warns if full. For older versions of several add ons that use localstorage this is useful to determine if silent errors are caused by localstorage filling up.

# Upgrade Percentage
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-upgrade-percent.user.js)

Adds a percentage next to the user icon for current upgrade progress. Click on the number to refresh it (use with care, this creates abnormal requests to the Wayfarer site that may appear suspicious to Niantic).

# Legal Stuff
Significant portions of the code within each of the `.user.js` script files in this repository were copied and modified from [Wayfarer+](https://github.com/MrJPGames/WayFarerPlus) and [Wayfarer-Toolkit](https://github.com/AlterTobi/WayFarer-Toolkit). Note that the toolkit code was originally authored by [MrJPGames](https://github.com/MrJPGames) but their repository was removed or made private so this link is to a fork which may no longer match the original code.

Modifications include but are not limited to: rearranging code in order to package similar features together in single scripts, adding additional functionality, removing portions which no longer apply to the updated Wayfarer website.
