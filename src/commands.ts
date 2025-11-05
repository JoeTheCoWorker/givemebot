import type { PlainMessage, SlashCommand } from '@towns-protocol/proto'

const commands = [
    {
        name: 'help',
        description: 'Get help with bot commands',
    },
    {
        name: 'giveaway_create',
        description: 'Create a new giveaway - admin only',
    },
    {
        name: 'giveaway_end',
        description: 'End current giveaway early - admin only',
    },
    {
        name: 'giveaway_status',
        description: 'Check giveaway status',
    },
    {
        name: 'giveaway_set_tip_fee',
        description: 'Set global tip entry fee - admin only',
    },
    {
        name: 'giveaway_set_cap',
        description: 'Set max tip entries per user - admin only',
    },
    {
        name: 'giveaway_set_eth_price',
        description: 'Update ETH price in USD - admin only',
    },
] as const satisfies PlainMessage<SlashCommand>[]

export default commands
