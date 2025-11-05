import type { PlainMessage, SlashCommand } from '@towns-protocol/proto'

const commands = [
    {
        name: 'help',
        description: 'Get help with bot commands',
    },
    {
        name: 'giveaway',
        description: 'Manage giveaways (admin only)',
    },
] as const satisfies PlainMessage<SlashCommand>[]

export default commands
