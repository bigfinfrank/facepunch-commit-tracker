# Facepunch Commit Tracker Webhook

Overcomplicated script to track commits made to [Facepunch's commit site](https://commits.facepunch.com), and send them to the Discord webhook of your choice.

## Using it

1. You'll need [NodeJS](https://nodejs.org/en/download), I use the latest LTS version at any given time, at time of development this is v20.12.2. It might run on versions a bit older/a bit newer than that, but no guarantees.

2. Copy `config-example.json` and name it `config.json`, then plug in the necessary values.
- webhookUrl is a Discord webhook URL
- repository is the repo you want to track on the commits site
- checkInterval is how often (in miliseconds) the script will check the facepunch site for new commits
- commitsFilePath is the path you want the script to save commit data to. This is used for resending any missed missed commits from time the script was offline as well as for debugging via --resend-last-commit=commtId.
- roleId is the role you want to ping in the message content. I'd recommend naming the role "Rust commit" so that the message content reads out like a sentence.
- ownerId is your user ID as the hoster, this will ping you specifically when the script encounters an error so you can check the created debug.log file

3. Run `node index.js`, and let the script do it's thing. On first start it'll send the previous 50 commits which you can use to make sure everything seems to be working correctly.
