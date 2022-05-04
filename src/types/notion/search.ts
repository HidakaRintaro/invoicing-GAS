export interface SearchRes {
    results: Search[]
}

interface Search {
    object: string,
    id: string,
    parent: {
        type: "page_id",
        page_id: string
    } | {
        type: "workspace",
        workspace: boolean
    }
}