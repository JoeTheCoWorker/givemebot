import { makeTownsBot } from '@towns-protocol/bot'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { parseEther, formatEther } from 'viem'
import commands from './commands'

// Giveaway state structure
interface Giveaway {
    channelId: string
    prize: string
    startTime: Date
    endTime: Date
    tipEntryFee: bigint // in wei (e.g., $0.50 worth of ETH)
    tipEntryCap: number // maximum additional entries a user can get from tips
    tipEntries: Map<string, number> // userId -> tip-based entries count
    reactionEntries: Map<string, number> // userId -> reaction-based entries count
    isActive: boolean
    announcementMessageId?: string
}

// Store active giveaways per channel (channelId -> Giveaway)
const activeGiveaways = new Map<string, Giveaway>()

// ETH price in USD (can be updated via admin command or API)
// Default: $3000/ETH (adjust as needed)
let ethPriceUsd = 3000

// Calculate wei equivalent of USD amount
function usdToWei(usdAmount: number): bigint {
    const ethAmount = usdAmount / ethPriceUsd
    return parseEther(ethAmount.toString())
}

// Format wei to readable format
function formatWei(wei: bigint): string {
    return formatEther(wei)
}

// Get or create giveaway for channel
function getGiveaway(channelId: string): Giveaway | null {
    return activeGiveaways.get(channelId) || null
}

// Add reaction entry for user
function addReactionEntry(channelId: string, userId: string, count: number = 1): void {
    const giveaway = activeGiveaways.get(channelId)
    if (!giveaway || !giveaway.isActive) return

    const currentEntries = giveaway.reactionEntries.get(userId) || 0
    giveaway.reactionEntries.set(userId, currentEntries + count)
}

// Add tip entry for user (with cap enforcement)
function addTipEntry(channelId: string, userId: string, count: number): number {
    const giveaway = activeGiveaways.get(channelId)
    if (!giveaway || !giveaway.isActive) return 0

    const currentTipEntries = giveaway.tipEntries.get(userId) || 0
    const remainingCap = giveaway.tipEntryCap - currentTipEntries
    
    if (remainingCap <= 0) return 0
    
    const entriesToAdd = Math.min(count, remainingCap)
    giveaway.tipEntries.set(userId, currentTipEntries + entriesToAdd)
    return entriesToAdd
}

// Get total entries for a user
function getTotalEntries(giveaway: Giveaway, userId: string): number {
    const reactionEntries = giveaway.reactionEntries.get(userId) || 0
    const tipEntries = giveaway.tipEntries.get(userId) || 0
    return reactionEntries + tipEntries
}

// Select random winner based on entry weights
function selectWinner(giveaway: Giveaway): string | null {
    // Combine all users from both entry types
    const allUsers = new Set([
        ...giveaway.reactionEntries.keys(),
        ...giveaway.tipEntries.keys()
    ])
    
    if (allUsers.size === 0) return null

    // Create weighted array: each user appears N times where N = their total entry count
    const weightedEntries: string[] = []
    for (const userId of allUsers) {
        const totalEntries = getTotalEntries(giveaway, userId)
        for (let i = 0; i < totalEntries; i++) {
            weightedEntries.push(userId)
        }
    }

    if (weightedEntries.length === 0) return null

    const randomIndex = Math.floor(Math.random() * weightedEntries.length)
    return weightedEntries[randomIndex]
}

// Format time remaining
function formatTimeRemaining(endTime: Date): string {
    const now = new Date()
    const msRemaining = endTime.getTime() - now.getTime()

    if (msRemaining <= 0) return 'Ended'

    const seconds = Math.floor(msRemaining / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
}

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

// Help command
bot.onSlashCommand('help', async (handler, { channelId }) => {
    const giveaway = getGiveaway(channelId)
    let helpText = '**🎁 Giveaway Bot Commands:**\n\n'

    if (giveaway && giveaway.isActive) {
        const allUsers = new Set([
            ...giveaway.reactionEntries.keys(),
            ...giveaway.tipEntries.keys()
        ])
        const totalEntries = Array.from(allUsers).reduce((sum, userId) => 
            sum + getTotalEntries(giveaway, userId), 0
        )
        
        helpText += `**Active Giveaway:**\n`
        helpText += `• Prize: ${giveaway.prize}\n`
        helpText += `• Time remaining: ${formatTimeRemaining(giveaway.endTime)}\n`
        helpText += `• Entries: ${totalEntries} total\n`
        helpText += `• Participants: ${allUsers.size}\n\n`
    }

    helpText += '**How to Enter:**\n'
    helpText += '• React with 🎁 to a giveaway message (1 entry)\n'
    helpText += '• Tip the bot for additional entries (every $0.50 USD in ETH = 1 entry)\n\n'

    helpText += '**Admin Commands:**\n'
    helpText += '• `/giveaway create <prize> <duration> [tip-fee] [cap]` - Create a new giveaway\n'
    helpText += '• `/giveaway end` - End current giveaway early\n'
    helpText += '• `/giveaway status` - Check giveaway status\n'
    helpText += '• `/giveaway set-fee <usd-amount>` - Set tip entry fee (default: $0.50)\n'
    helpText += '• `/giveaway set-cap <max-entries>` - Set max tip entries per user (default: 10)\n'
    helpText += '• `/giveaway set-eth-price <price>` - Update ETH price in USD (default: $3000)'

    await handler.sendMessage(channelId, helpText)
})

// Giveaway admin commands
bot.onSlashCommand('giveaway', async (handler, event) => {
    const { channelId, userId, spaceId, args } = event

    // Check if user is admin
    const isAdmin = await handler.hasAdminPermission(userId, spaceId)
    if (!isAdmin) {
        await handler.sendMessage(channelId, '❌ Only admins can manage giveaways.')
        return
    }

    const subcommand = args[0]?.toLowerCase()

    // Create giveaway: /giveaway create <prize> <duration> [tip-fee]
    if (subcommand === 'create') {
        const prize = args.slice(1, -1).join(' ') // Everything except last arg
        const durationStr = args[args.length - 1] // Last arg is duration

        if (!prize || !durationStr) {
            await handler.sendMessage(
                channelId,
                'Usage: `/giveaway create <prize description> <duration> [fee:0.50] [cap:10]`\n' +
                    'Duration format: 1h, 2d, 30m, etc.\n' +
                    'Optional: fee:<amount> (default: $0.50), cap:<max-entries> (default: 10)\n' +
                    'Examples:\n' +
                    '• `/giveaway create 100 USDC 24h`\n' +
                    '• `/giveaway create 100 USDC 24h fee:1.00 cap:20`'
            )
            return
        }

        // Parse duration (e.g., "24h", "2d", "30m")
        const durationMatch = durationStr.match(/^(\d+)([hdm])$/)
        if (!durationMatch) {
            await handler.sendMessage(
                channelId,
                'Invalid duration format. Use: 1h (hours), 2d (days), 30m (minutes)\n' +
                    'Example: `/giveaway create 100 USDC 24h`'
            )
            return
        }

        const durationValue = parseInt(durationMatch[1])
        const durationUnit = durationMatch[2]

        let msDuration = 0
        if (durationUnit === 'm') msDuration = durationValue * 60 * 1000
        else if (durationUnit === 'h') msDuration = durationValue * 60 * 60 * 1000
        else if (durationUnit === 'd') msDuration = durationValue * 24 * 60 * 60 * 1000

        // Check if there's already an active giveaway
        const existing = getGiveaway(channelId)
        if (existing && existing.isActive) {
            await handler.sendMessage(
                channelId,
                '❌ There is already an active giveaway in this channel. End it first with `/giveaway end`'
            )
            return
        }

        // Get tip fee from args or use default
        const tipFeeArg = args.find(arg => arg.startsWith('fee:'))
        const tipFeeUsd = tipFeeArg ? parseFloat(tipFeeArg.split(':')[1]) : 0.5
        const tipEntryFee = usdToWei(tipFeeUsd)

        // Get tip entry cap from args or use default (10 additional entries)
        const capArg = args.find(arg => arg.startsWith('cap:'))
        const tipEntryCap = capArg ? parseInt(capArg.split(':')[1]) : 10

        const startTime = new Date()
        const endTime = new Date(startTime.getTime() + msDuration)

        const giveaway: Giveaway = {
            channelId,
            prize,
            startTime,
            endTime,
            tipEntryFee,
            tipEntryCap,
            tipEntries: new Map(),
            reactionEntries: new Map(),
            isActive: true,
        }

        activeGiveaways.set(channelId, giveaway)

        // Calculate cap amount in USD
        const capAmountUsd = tipFeeUsd * tipEntryCap

        // Announce the giveaway
        const announcement = await handler.sendMessage(
            channelId,
            `🎉 **GIVEAWAY STARTED!** 🎉\n\n` +
                `**Prize:** ${prize}\n` +
                `**Ends:** ${endTime.toLocaleString()}\n` +
                `**Time remaining:** ${formatTimeRemaining(endTime)}\n\n` +
                `**How to Enter:**\n` +
                `• React with 🎁 to this message (1 entry)\n` +
                `• Tip this bot for additional entries (every $${tipFeeUsd.toFixed(2)} USD in ETH = 1 entry)\n` +
                `• Maximum additional entries from tips: ${tipEntryCap} (tip up to $${capAmountUsd.toFixed(2)} USD in ETH)\n\n` +
                `Good luck! 🍀`
        )

        giveaway.announcementMessageId = announcement.eventId

        // Add reaction to the announcement message
        await handler.sendReaction(channelId, announcement.eventId, '🎁')
    }
    // End giveaway: /giveaway end
    else if (subcommand === 'end') {
        const giveaway = getGiveaway(channelId)
        if (!giveaway || !giveaway.isActive) {
            await handler.sendMessage(channelId, '❌ No active giveaway in this channel.')
            return
        }

        giveaway.isActive = false
        const winner = selectWinner(giveaway)

        if (!winner) {
            await handler.sendMessage(channelId, '🎁 Giveaway ended. No entries were received.')
            return
        }

        const allUsers = new Set([
            ...giveaway.reactionEntries.keys(),
            ...giveaway.tipEntries.keys()
        ])
        const totalEntries = Array.from(allUsers).reduce((sum, userId) => 
            sum + getTotalEntries(giveaway, userId), 0
        )
        const winnerEntries = getTotalEntries(giveaway, winner)

        await handler.sendMessage(
            channelId,
            `🎉 **GIVEAWAY ENDED!** 🎉\n\n` +
                `**Prize:** ${giveaway.prize}\n` +
                `**Winner:** <@${winner}>\n` +
                `**Winner's entries:** ${winnerEntries}\n` +
                `**Total entries:** ${totalEntries}\n` +
                `**Participants:** ${allUsers.size}\n\n` +
                `Congratulations to the winner! 🎊`
        )

        activeGiveaways.delete(channelId)
    }
    // Status: /giveaway status
    else if (subcommand === 'status') {
        const giveaway = getGiveaway(channelId)
        if (!giveaway || !giveaway.isActive) {
            await handler.sendMessage(channelId, '❌ No active giveaway in this channel.')
            return
        }

        const allUsers = new Set([
            ...giveaway.reactionEntries.keys(),
            ...giveaway.tipEntries.keys()
        ])
        const totalEntries = Array.from(allUsers).reduce((sum, userId) => 
            sum + getTotalEntries(giveaway, userId), 0
        )
        const tipFeeUsd = (Number(giveaway.tipEntryFee) / 1e18) * ethPriceUsd
        const capAmountUsd = tipFeeUsd * giveaway.tipEntryCap

        let statusText = `**🎁 Giveaway Status**\n\n`
        statusText += `**Prize:** ${giveaway.prize}\n`
        statusText += `**Started:** ${giveaway.startTime.toLocaleString()}\n`
        statusText += `**Ends:** ${giveaway.endTime.toLocaleString()}\n`
        statusText += `**Time remaining:** ${formatTimeRemaining(giveaway.endTime)}\n`
        statusText += `**Tip entry fee:** $${tipFeeUsd.toFixed(2)} USD (${formatWei(giveaway.tipEntryFee)} ETH)\n`
        statusText += `**Max tip entries:** ${giveaway.tipEntryCap} (cap: $${capAmountUsd.toFixed(2)} USD in ETH)\n\n`
        statusText += `**Entries:**\n`
        statusText += `• Total entries: ${totalEntries}\n`
        statusText += `• Participants: ${allUsers.size}\n\n`

        // Show top 5 participants
        const sortedEntries = Array.from(allUsers)
            .map(userId => ({
                userId,
                total: getTotalEntries(giveaway, userId),
                reactions: giveaway.reactionEntries.get(userId) || 0,
                tips: giveaway.tipEntries.get(userId) || 0
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)

        if (sortedEntries.length > 0) {
            statusText += `**Top Participants:**\n`
            for (const entry of sortedEntries) {
                statusText += `• <@${entry.userId}>: ${entry.total} entries (${entry.reactions} reactions, ${entry.tips} tips)\n`
            }
        }

        await handler.sendMessage(channelId, statusText)
    }
    // Set tip fee: /giveaway set-fee <usd-amount>
    else if (subcommand === 'set-fee') {
        const feeArg = args[1]
        if (!feeArg) {
            await handler.sendMessage(
                channelId,
                'Usage: `/giveaway set-fee <usd-amount>`\n' +
                    'Example: `/giveaway set-fee 1.00` (sets fee to $1.00 USD)'
            )
            return
        }

        const feeUsd = parseFloat(feeArg)
        if (isNaN(feeUsd) || feeUsd <= 0) {
            await handler.sendMessage(channelId, '❌ Invalid amount. Please provide a positive number.')
            return
        }

        const giveaway = getGiveaway(channelId)
        if (!giveaway || !giveaway.isActive) {
            await handler.sendMessage(channelId, '❌ No active giveaway in this channel.')
            return
        }

        giveaway.tipEntryFee = usdToWei(feeUsd)
        const capAmountUsd = feeUsd * giveaway.tipEntryCap
        await handler.sendMessage(
            channelId,
            `✅ Tip entry fee updated to $${feeUsd.toFixed(2)} USD (${formatWei(giveaway.tipEntryFee)} ETH)\n` +
                `New cap amount: $${capAmountUsd.toFixed(2)} USD in ETH for ${giveaway.tipEntryCap} entries`
        )
    }
    // Set tip entry cap: /giveaway set-cap <max-entries>
    else if (subcommand === 'set-cap') {
        const capArg = args[1]
        if (!capArg) {
            await handler.sendMessage(
                channelId,
                'Usage: `/giveaway set-cap <max-entries>`\n' +
                    'Example: `/giveaway set-cap 20` (sets max tip entries to 20)'
            )
            return
        }

        const cap = parseInt(capArg)
        if (isNaN(cap) || cap <= 0) {
            await handler.sendMessage(channelId, '❌ Invalid number. Please provide a positive integer.')
            return
        }

        const giveaway = getGiveaway(channelId)
        if (!giveaway || !giveaway.isActive) {
            await handler.sendMessage(channelId, '❌ No active giveaway in this channel.')
            return
        }

        giveaway.tipEntryCap = cap
        const tipFeeUsd = (Number(giveaway.tipEntryFee) / 1e18) * ethPriceUsd
        const capAmountUsd = tipFeeUsd * cap
        await handler.sendMessage(
            channelId,
            `✅ Tip entry cap updated to ${cap} entries\n` +
                `Users can tip up to $${capAmountUsd.toFixed(2)} USD in ETH for additional entries`
        )
    }
    // Set ETH price: /giveaway set-eth-price <price>
    else if (subcommand === 'set-eth-price') {
        const priceArg = args[1]
        if (!priceArg) {
            await handler.sendMessage(
                channelId,
                'Usage: `/giveaway set-eth-price <price>`\n' +
                    'Example: `/giveaway set-eth-price 3000` (sets ETH price to $3000 USD)'
            )
            return
        }

        const price = parseFloat(priceArg)
        if (isNaN(price) || price <= 0) {
            await handler.sendMessage(channelId, '❌ Invalid price. Please provide a positive number.')
            return
        }

        ethPriceUsd = price
        await handler.sendMessage(channelId, `✅ ETH price updated to $${price.toFixed(2)} USD`)
    }
    // Unknown subcommand
    else {
        await handler.sendMessage(
            channelId,
            'Available subcommands:\n' +
                '• `create` - Create a new giveaway\n' +
                '• `end` - End current giveaway\n' +
                '• `status` - Check giveaway status\n' +
                '• `set-fee` - Set tip entry fee\n' +
                '• `set-cap` - Set max tip entries per user\n' +
                '• `set-eth-price` - Update ETH price'
        )
    }
})

// Handle reactions for entries
bot.onReaction(async (handler, event) => {
    const { reaction, channelId, messageId, userId } = event

    // Only count 🎁 reactions
    if (reaction !== '🎁') return

    const giveaway = getGiveaway(channelId)
    if (!giveaway || !giveaway.isActive) {
        return
    }

    // Check if this is the giveaway announcement message
    if (messageId !== giveaway.announcementMessageId) {
        return
    }

    // Check if giveaway has ended
    if (new Date() > giveaway.endTime) {
        giveaway.isActive = false
        return
    }

    // Add reaction entry
    addReactionEntry(channelId, userId, 1)

    // Get user's total entries
    const userEntries = getTotalEntries(giveaway, userId)

    await handler.sendMessage(
        channelId,
        `✅ Entry added! <@${userId}> now has ${userEntries} ${userEntries === 1 ? 'entry' : 'entries'}. Good luck! 🍀`
    )
})

// Handle tips for additional entries
bot.onTip(async (handler, event) => {
    const { channelId, receiverAddress, amount } = event

    // Check if tip is for the bot
    if (receiverAddress !== bot.botId) {
        return
    }

    const giveaway = getGiveaway(channelId)
    if (!giveaway || !giveaway.isActive) {
        return
    }

    // Check if giveaway has ended
    if (new Date() > giveaway.endTime) {
        giveaway.isActive = false
        return
    }

    // Calculate additional entries based on tip amount
    // Each tipEntryFee worth of ETH = 1 entry
    const potentialEntries = Number(amount / giveaway.tipEntryFee)
    if (potentialEntries < 1) {
        const tipFeeUsd = (Number(giveaway.tipEntryFee) / 1e18) * ethPriceUsd
        await handler.sendMessage(
            channelId,
            `💰 Thank you for the tip! However, tips must be at least ${formatWei(giveaway.tipEntryFee)} ETH ($${tipFeeUsd.toFixed(2)} USD) to count as an entry.`
        )
        return
    }

    // Add entries (with cap enforcement)
    const entriesAdded = addTipEntry(channelId, event.senderAddress, potentialEntries)
    
    if (entriesAdded === 0) {
        // User has reached the cap
        const currentTipEntries = giveaway.tipEntries.get(event.senderAddress) || 0
        const tipFeeUsd = (Number(giveaway.tipEntryFee) / 1e18) * ethPriceUsd
        const capAmountUsd = tipFeeUsd * giveaway.tipEntryCap
        
        await handler.sendMessage(
            channelId,
            `💰 Thank you for the tip! However, you've already reached the maximum of ${giveaway.tipEntryCap} additional entries from tips.\n` +
                `You've already tipped the cap amount of $${capAmountUsd.toFixed(2)} USD in ETH.`
        )
        return
    }

    // Get user's stats
    const currentTipEntries = giveaway.tipEntries.get(event.senderAddress) || 0
    const userTotalEntries = getTotalEntries(giveaway, event.senderAddress)
    const tipFeeUsd = (Number(giveaway.tipEntryFee) / 1e18) * ethPriceUsd
    const capAmountUsd = tipFeeUsd * giveaway.tipEntryCap
    const remainingCap = giveaway.tipEntryCap - currentTipEntries

    let message = `💰 Thank you for the tip! <@${event.senderAddress}> received ${entriesAdded} additional ${entriesAdded === 1 ? 'entry' : 'entries'}!\n`
    message += `You now have ${userTotalEntries} total ${userTotalEntries === 1 ? 'entry' : 'entries'} (${currentTipEntries}/${giveaway.tipEntryCap} tip entries). Good luck! 🍀\n`
    
    if (remainingCap > 0) {
        const remainingCapUsd = tipFeeUsd * remainingCap
        message += `You can still tip up to $${remainingCapUsd.toFixed(2)} USD in ETH for ${remainingCap} more ${remainingCap === 1 ? 'entry' : 'entries'} (cap: $${capAmountUsd.toFixed(2)} USD total).`
    } else {
        message += `You've reached the maximum tip entries cap of $${capAmountUsd.toFixed(2)} USD in ETH.`
    }

    await handler.sendMessage(channelId, message)
})

// Check for ended giveaways and announce winners
// This runs periodically (you could use a cron job or check on each event)
// For now, we'll check when reactions/tips come in, but we could add a timer

// Clean up expired giveaways periodically
setInterval(() => {
    const now = new Date()
    for (const [channelId, giveaway] of activeGiveaways.entries()) {
        if (giveaway.isActive && now > giveaway.endTime) {
            giveaway.isActive = false
            // Winner selection will happen when admin runs /giveaway end
            // Or we could auto-announce here, but it's safer to let admin control it
        }
    }
}, 60000) // Check every minute

const { jwtMiddleware, handler } = bot.start()

const app = new Hono()
app.use(logger())
app.post('/webhook', jwtMiddleware, handler)

export default app
