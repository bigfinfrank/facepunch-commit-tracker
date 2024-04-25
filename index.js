const axios = require('axios');
const { WebhookClient, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const baseUrl = `https://commits.facepunch.com/r/${config.repository}`;

let existingCommits = [];


function logError(error, action) {
  const errorMessage = `[${new Date().toISOString()}] Error encountered when ${action}: ${error.stack || error}\n`;
  fs.appendFileSync('debug.log', errorMessage);
  console.error(errorMessage);

  const ownerNotification = new WebhookClient({ url: config.webhookUrl });
  ownerNotification.send({
    content: `<@!${config.ownerId}> An error was encountered when ${action}. Please check debug.log for more details.`,
    allowedMentions: { parse: ['users'] }
  }).catch(err => logError(err, 'Failed to notify owner:'));
}

async function loadCommits() {
  const filePath = config.commitsFilePath;
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      existingCommits = JSON.parse(data);
      if (!Array.isArray(existingCommits)) {
        existingCommits = [];
      }
    } else {
      existingCommits = [];
      fs.writeFileSync(filePath, JSON.stringify(existingCommits, null, 2));
    }
  } catch (err) {
    logError(err, 'loading commits from file');
  }
}

async function checkCommits() {
  try {
    loadCommits();
    const newCommits = await fetchCommits();
    if (newCommits && newCommits.length > 0) {
      processCommits(newCommits);
    }
  } catch (err) {
    logError(err, 'checking for new commits');
  }
}

async function fetchCommits(page = 1) {
  try {
    const response = await axios.get(`${baseUrl}?p=${page}&format=json`);
    return response.data.results;
  } catch (err) {
    logError(err, `fetching commits from page ${page}`);
    return [];
  }
}

async function processCommits(commits) {
  try {
    let newCommits = false;
    const knownCommitIds = new Set(existingCommits.map(c => c.id));
    commits.forEach(commit => {
      if (!knownCommitIds.has(commit.id)) {
        existingCommits.push(commit);
        newCommits = true;
        sendCommitToDiscord(commit);
      }
    });
    if (newCommits) {
      fs.writeFileSync(config.commitsFilePath, JSON.stringify(existingCommits, null, 2));
    } else {
      console.log('No new commits to add.');
    }
  } catch (err) {
    logError(err, 'processing new commits');
  }
}


async function sendCommitToDiscord(commit) {
  const webhookClient = new WebhookClient({ url: config.webhookUrl });
  const firstLine = commit.message.split('\n')[0];
  const title = firstLine.length > 256 ? firstLine.substring(0, 253) + '...' : firstLine;
  let description = commit.message.substring(firstLine.length).trim();

  const branchUrl = `https://commits.facepunch.com/r/${commit.repo}/${encodeURIComponent(commit.branch)}`;
  const commitUrl = `https://commits.facepunch.com/${commit.id}`;
  const avatarUrl = commit.user.avatar || 'https://files.facepunch.com/garry/f549bfc2-2a49-4eb8-a701-3efd7ae046ac.png';

  const allUrls = commit.message.match(/https:\/\/files\.facepunch\.com\/[^\s]+/g) || [];
  const embeds = [];
  const attachments = [];

  const mainEmbed = new EmbedBuilder()
    .setTitle(title)
    .setURL(branchUrl)
    .setAuthor({
      name: commit.user.name,
      iconURL: avatarUrl,
      url: `https://commits.facepunch.com/${commit.user.name.replace(/\s/g, '')}/${config.repository}`
    })
    .setFooter({
      text: `Changeset ${commit.changeset}`,
      iconURL: 'https://images.squarespace-cdn.com/content/v1/627cb6fa4355783e5e375440/c92dbe6c-2afa-457c-a6b3-e9e8847d4565/rust-logo.png'
    })
    .setTimestamp(new Date(commit.created))
    .setColor(`#${Math.abs(commit.user.name.split('').reduce((acc, char) => acc * char.charCodeAt(0) + char.charCodeAt(0), 0)).toString(16).slice(0, 6).padEnd(6, '0')}`);

  mainEmbed.addFields({
    name: "Commit Details",
    value: `Commit ID: [${commit.id}](${commitUrl})\nBranch: [${commit.branch}](${branchUrl})`,
    inline: false
  });

  if (description.trim().length > 0) {
    mainEmbed.setDescription(description);
  }

  let imageCount = 0;
  allUrls.forEach(url => {
    if (/\.(mp4|mov|mkv)$/.test(url)) {
      attachments.push(new AttachmentBuilder(url));
    } else if (imageCount < 4) {
      if (imageCount === 0) {
        mainEmbed.setImage(url);
      } else {
        const imageEmbed = new EmbedBuilder()
          .setTitle('Additional Image')
          .setURL(branchUrl)
          .setImage(url)
          .setColor(`#${Math.abs(commit.user.name.split('').reduce((acc, char) => acc * char.charCodeAt(0) + char.charCodeAt(0), 0)).toString(16).slice(0, 6).padEnd(6, '0')}`);
        embeds.push(imageEmbed);
      }
      imageCount++;
    }
  });

  embeds.unshift(mainEmbed);

  try {
    await webhookClient.send({
      content: isNaN(parseInt(commit.changeset)) ? `New obfuscated commit by ${commit.user.name}` : `New <@&${config.roleId}> by ${commit.user.name}, ${firstLine}`,
      username: commit.user.name,
      avatarURL: avatarUrl,
      embeds: embeds,
      files: attachments,
      allowedMentions: { parse: ['roles'] }
    });
    console.log('Message sent successfully with', embeds.length, 'embeds and', attachments.length, 'attachments.');
  } catch (error) {
    logError(error, 'sending commit to Discord');
  }
}


function resendCommit(commitId) {
  console.log("Attempting to resend commit ID:", commitId);
  const filePath = config.commitsFilePath;
  try {
    if (fs.existsSync(filePath)) {
      console.log("Commits file found. Reading...");
      const data = fs.readFileSync(filePath, 'utf8');
      const commits = JSON.parse(data);
      const commitToResend = commits.find(commit => commit.id.toString() === commitId);
      if (commitToResend) {
        console.log("Sending commit:", commitId);
        sendCommitToDiscord(commitToResend);
      } else {
        console.log("Commit ID not found in the list.");
      }
    } else {
      console.log("Commits file not found.");
    }
  } catch (err) {
    logError(err, `resending commit ID ${commitId}`);
  }
}

async function checkCommits() {
  try {
    loadCommits();
    const newCommits = await fetchCommits();
    if (newCommits.length > 0) {
      processCommits(newCommits);
    }
  } catch (err) {
    logError(err, 'checking for new commits');
  }
}


if (process.argv.includes('--resend-commit')) {
  const commitId = process.argv.find(arg => arg.startsWith('--resend-commit=')).split('=')[1];
  resendCommit(commitId);
} else {
  setInterval(checkCommits, config.checkInterval);
  checkCommits();
}
