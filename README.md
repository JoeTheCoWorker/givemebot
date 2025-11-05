# Giveaway Bot

A Towns Protocol bot that manages cryptocurrency giveaways with dual entry methods: reactions and tips.

## What This Bot Does

This bot enables channel admins to create and manage giveaways with:

- **Reaction-based entries**: Users react with 🎁 to the giveaway message for 1 entry
- **Tip-based entries**: Users can tip the bot in ETH for additional entries (configurable fee per entry)
- **Configurable entry caps**: Set maximum tip entries per user to prevent excessive spending
- **Weighted random selection**: Winner selection based on total entry count (more entries = higher chance)
- **Real-time status tracking**: View giveaway stats, participants, and top entries
- **Automatic expiration**: Giveaways automatically end after the set duration

## Features

- **Dual Entry System**: 
  - Free entry via reaction (🎁 emoji)
  - Paid entries via cryptocurrency tips (ETH)
- **Flexible Configuration**:
  - Custom prize descriptions
  - Configurable duration (minutes, hours, or days)
  - Adjustable tip entry fee (default: $0.50 USD per entry)
  - Maximum tip entries cap per user (default: 10 entries)
  - ETH price tracking for USD conversion
- **Admin Controls**:
  - Create giveaways with `/giveaway create`
  - End giveaways early with `/giveaway end`
  - View detailed status with `/giveaway status`
  - Adjust settings during active giveaways
- **Smart Entry Management**:
  - Weighted winner selection based on entry count
  - Entry cap enforcement to prevent excessive spending
  - Real-time entry confirmation messages
  - Participant statistics and leaderboards

## Setup

1. Copy `.env.sample` to `.env` and fill in your credentials:
   ```
   APP_PRIVATE_DATA=<your_base64_encoded_private_data>
   JWT_SECRET=<your_jwt_secret>
   PORT=3000  # Optional, defaults to 3000
   ```

2. Install dependencies:
   ```bash
   bun install
   # or
   yarn install
   ```

3. Run the bot:
   ```bash
   bun run dev
   # or
   yarn dev
   ```

## Environment Variables

- `APP_PRIVATE_DATA`: Your Towns app private data (base64 encoded)
- `JWT_SECRET`: JWT secret for webhook authentication
- `PORT`: Port to run the bot on (optional, defaults to 3000)

## Usage

### Admin Commands

**Create a Giveaway:**
```
/giveaway create <prize> <duration> [fee:0.50] [cap:10]
```

Examples:
- `/giveaway create 100 USDC 24h` - Creates a 24-hour giveaway for 100 USDC
- `/giveaway create 1 ETH 7d fee:1.00 cap:20` - Creates a 7-day giveaway with $1.00 entry fee and 20 entry cap
- `/giveaway create NFT Prize 30m` - Creates a 30-minute giveaway

**End Giveaway Early:**
```
/giveaway end
```

**Check Status:**
```
/giveaway status
```

**Adjust Settings (during active giveaway):**
```
/giveaway set-fee <usd-amount>      # Change tip entry fee
/giveaway set-cap <max-entries>     # Change max tip entries per user
/giveaway set-eth-price <price>     # Update ETH price in USD
```

**Get Help:**
```
/help
```

### User Participation

1. **Reaction Entry**: React with 🎁 to the giveaway announcement message (1 free entry)
2. **Tip Entry**: Send ETH tips to the bot for additional entries
   - Each tip equal to the entry fee = 1 additional entry
   - Tips are cumulative (e.g., 2x entry fee = 2 entries)
   - Maximum entries from tips are capped (default: 10)
   - You'll receive confirmation messages showing your entry count

## How It Works

1. **Giveaway Creation**: Admin creates a giveaway with prize, duration, and optional fee/cap settings
2. **Entry Collection**: 
   - Users react with 🎁 for a free entry
   - Users tip the bot ETH for additional entries (each $0.50 USD worth = 1 entry by default)
3. **Winner Selection**: When the giveaway ends, a winner is randomly selected with weighted probability based on total entry count
4. **Announcement**: The winner is announced with statistics about total entries and participants

## Technical Details

- **Storage**: In-memory storage (giveaways reset on bot restart)
- **Entry Tracking**: Separate tracking for reaction entries and tip entries
- **Weighted Selection**: Each entry counts as one "ticket" in the random selection
- **ETH Conversion**: Uses configurable ETH price (default: $3000 USD) to convert tip amounts to USD

## Requirements

- Node.js/Bun runtime
- Towns Protocol bot credentials
- Admin permissions in the Towns space (for creating/managing giveaways)

## Code Structure

- `src/index.ts`: Main bot logic with giveaway management
- `src/commands.ts`: Slash command definitions
- State management using in-memory Maps (giveaways reset on restart)

## Notes

- Giveaways are stored in memory and will be lost if the bot restarts
- For production use, consider adding persistent storage (database)
- The bot requires admin permissions to create/manage giveaways
- Users can participate by reacting or tipping - both methods are tracked separately but combined for winner selection
