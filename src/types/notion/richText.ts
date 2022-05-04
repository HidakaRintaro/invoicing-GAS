export interface RichText {
    plain_text: string
    href: string | null
    type: "text" | "mention" | "equation"
    text: RichTextText
}

interface RichTextText {
    content: string
    link: string | null
}