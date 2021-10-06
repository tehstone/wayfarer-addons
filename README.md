# wayfarer-addons

This is a collection of plugins with the Wayfarer Review website which augment the experience in various ways. 
Each plugin will work independtly or along side the rest so users can customize their Wayfarer experience.

[Tampermonkey](https://tampermonkey.net/) is required in order to install these plugins, then each can be installed via the link below.

# Keyboard Review
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-keyboard-review.user.js)
This plugin enables nearly full control of the review page via the keyboard.

- Numbers 1-5 to select a rating for the selected category
- Left & Right arrows to navigate between categories
- Numbers within Rejection Dialog to navigate the reject reason menu
- Backspace within Rejection Dialog to navigate back a level in the reject reason menu
- When the text box in the Rejection Dialog is focused, Shift+Enter will add a newline, Enter will submit the nomination
- Whenever the submit button is active, Ctrl+Enter will select the "Submit and finish reviewing" option
- "D" to mark the selected nomination as a duplicate
- "Q" to open the main photo
- "E" to open the supporting photo
- "R" & "F" to zoom in and out of the map

# Extended Stats
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-extended-stats.user.js)

- Adds total agreement count and percentage to the Profile Page
- Includes settings to indicate whether agreements should be calculated from the Badge Stat in Pokemon GO or based on Upgrade Count
- Includes settings for current Badge Count and Bonus Upgrades Earned count

# Review History
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-review-history.user.js)

- Stores review history in 3 separate datasets for New Nominations, Edit Nominations, and Photo Reviews per user
- Includes Export and Remove options
- Currently there is no visualizer for this data

# Nomination Map 
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-map.user.js)
Places a map of all player nominations at the top of the Nominations Page

# Nomination Streetview
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-streetview.user.js)
Adds a Streetview panel to the selected nomination

# Nomination Stats
[Install](https://github.com/tehstone/wayfarer-addons/raw/main/wayfarer-nomination-stats.user.js)
Basic stats about nominations.

# Legal Stuff
Significant portions of the code within each of the `.user.js` script files in this repository were copied and modified from [Wayfarer+](https://github.com/MrJPGames/WayFarerPlus) and [Wayfarer-Toolkit](https://github.com/AlterTobi/WayFarer-Toolkit). Note that the toolkit code was originally authored by [MrJPGames](https://github.com/MrJPGames) but their repository was removed or made private so this link is to a fork which may no longer match the original code.

Modifications include but are not limited to: rearranging code in order to package similar features together in single scripts, adding additional functionality, removing portions which no longer apply to the updated Wayfarer website.
