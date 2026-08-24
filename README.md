# Masary

**A voice & chat-first expense tracker.** Open the app, say or type what you spent - Masary turns it into a structured transaction and keeps your money visible. Built bilingual from day one: Egyptian Arabic, English, and the mixed code-switching in between.

## How it works

You tell Masary what you spent, when, and anything else - in natural language:

- "bought groceries for 200"
- "spent 3.50 on coffee yesterday"
- "دفعت 50 للراجل اللي على الناصية" (paid the guy on the corner 50)
- "شريت قهوة وميترو بـ 35" (multi-item, mixed Arabic/English)

An AI model extracts the structured data (amount, currency, merchant, category, date) from what you said and **stores the transaction in the database**. No forms, no pickers, no spreadsheets.

## Core surfaces

### 1. Chat

The heart of the app - a conversational chat page, just like Claude or ChatGPT.

- The user inserts what they spent, when, where, and so on - everything goes through the chat.
- Input by **voice** (speech-to-text) or **text**, in Arabic, English, or mixed.
- The model understands the message, extracts the expense details, and the transaction is stored.
- Multi-item messages become multiple transactions ("coffee 30 and metro 15" = 2 records).
- Relative dates are understood ("yesterday", "امبارح") and resolved to real dates.
- The chat is also where you ask questions about your spending ("how much did I spend on coffee this month?").

### 2. Dashboard

See everything at a glance:

- Spending per **day, week, month**, and over time
- Breakdown by **category** (food, transport, groceries, ...)
- Recent transactions and trends
- **Multi-currency** support (EGP default, USD/EUR/SAR/...) with unified totals

## Tech stack (planned)

- **Mobile app**: React Native + Expo + NativeWind
- **AI pipeline**: speech-to-text + LLM structured extraction (JSON) - voice and text both flow through the same extraction
- **Storage**: local-first database on device with sync to a cloud backend (exact choices defined in the technical plan)

## Status

Planning. Market research complete; technical plan and milestones next.

## License

TBD
