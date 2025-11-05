import type { PlainMessage, SlashCommand } from '@towns-protocol/proto'

const commands = [
    {
        name: 'help',
        description: 'Get help with bot commands',
    },
    {
        name: 'giveaway-create',
        description: 'Create a new giveaway - admin only',
    },
    {
        name: 'giveaway-end',
        description: 'End current giveaway early - admin only',
    },
    {
        name: 'giveaway-status',
        description: 'Check giveaway status',
    },
    {
        name: 'giveaway-set-tip-fee',
        description: 'Set global tip entry fee - admin only',
    },
    {
        name: 'giveaway-set-cap',
        description: 'Set max tip entries per user - admin only',
    },
    {
        name: 'giveaway-set-eth-price',
        description: 'Update ETH price in USD - admin only',
    },
] as const satisfies PlainMessage<SlashCommand>[]

export default commands
