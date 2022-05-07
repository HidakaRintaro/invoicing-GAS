// https://github.com/google/clasp/blob/master/docs/typescript.md#modules-exports-and-imports

// 型定義ファイルは出力されないのでOK
import { BlockChildrenRes } from "./types/notion/block"
import { SearchRes } from "./types/notion/search"
import { DatabaseRes } from "./types/notion/database"
import { Attendance } from "./types/attendance"
import { Page } from "./types/notion/page"


const main = () => {
    const sheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") ?? ""
    const folderId = PropertiesService.getScriptProperties().getProperty("FOLDER_ID") ?? ""
    const token = PropertiesService.getScriptProperties().getProperty("AUTH_TOKEN") ?? ""
    const notionVersion = PropertiesService.getScriptProperties().getProperty("NOTION_VERSION") ?? "2021-02-22"

    const headers = setHeaders(token, notionVersion)

    const newDate = new Date();

    // 請求書のIDを取得する (search)
    const invoicePageSearch = postSearch({ headers, payload: { query: "請求書" } })
    const invoicePageId = invoicePageSearch[0].id

    // 請求書の宛先・住所などのブロックのIDを取得 (block/child)
    let invoiceBaseInfoId = ""
    const invoicePageBlocks = getBlockChildren({ headers, blockId: invoicePageId })
    invoicePageBlocks.forEach((block) => {
        if (block.type === "table" && block.table?.table_width == 2) {
            invoiceBaseInfoId = block.id
        }
    })

    // 宛先・住所などを取得
    const invoiceBaseInfo = {
        destination: "",  // 宛先
        name: "",  // 氏名
        zipCode: "",  // 郵便番号
        address: "",  // 住所
        tel: "",  // 電話番号
        bank: "",  // 銀行・支店
        bankNumber: "",  // 口座番号
        bankName: "",  // 名義
    }
    const invoiceBaseInfoList = getBlockChildren({ headers, blockId: invoiceBaseInfoId })
    invoiceBaseInfoList.forEach((block) => {
        if (block.table_row === undefined) return
        const row = block.table_row.cells ?? []
        switch (row[0][0].plain_text) {
            case "宛先":
                invoiceBaseInfo.destination = row[1][0].plain_text
                break;
            case "氏名":
                invoiceBaseInfo.name = row[1][0].plain_text
                break;
            case "郵便番号":
                invoiceBaseInfo.zipCode = row[1][0].plain_text
                break;
            case "住所":
                invoiceBaseInfo.address = row[1][0].plain_text
                break;
            case "電話番号":
                invoiceBaseInfo.tel = row[1][0].plain_text
                break;
            case "銀行・支店":
                invoiceBaseInfo.bank = row[1][0].plain_text
                break;
            case "口座番号":
                invoiceBaseInfo.bankNumber = row[1][0].plain_text
                break;
            case "名義":
                invoiceBaseInfo.bankName = row[1][0].plain_text
                break;
        }
    })

    // 現在日時でSearchしIDを取得 (search)
    const fmtDate = Utilities.formatDate(newDate, "Asia/Tokyo", "yyyy-MM")
    const datePageSearch = postSearch({ headers, payload: { query: fmtDate } })
    // TODO Slackなどに通知するなどして今月の請求書が見つからなかったことを連絡する
    if (datePageSearch.length === 0) {
        Logger.log("今月の請求書が見つかりませんでした")
        return
    }
    const datePageId = datePageSearch[0].id

    // 勤怠のTableと件名などのブロックのIDを取得 (block/child)
    const datePageBlockList = getBlockChildren({ headers, blockId: datePageId })

    // 件名・Noなどを取得 (block/child)
    const invoiceDetailInfo = {
        subject: "",
        no: "",
        date: "",
        deadline: ""
    }
    const invoiceDetailBlockId = datePageBlockList.find(block => block.type === "table")?.id
    const invoiceDetailInfoList = getBlockChildren({ headers, blockId: invoiceDetailBlockId ?? "" })
    invoiceDetailInfoList.forEach(block => {
        if (block.table_row === undefined) return
        const row = block.table_row.cells ?? []
        switch (row[0][0].plain_text) {
            case "件名":
                invoiceDetailInfo.subject = row[1][0] !== undefined ? row[1][0].plain_text : Utilities.formatDate(newDate, "Asia/Tokyo", "M") + "月分ご請求"
                break;
            case "請求書No.":
                invoiceDetailInfo.no = row[1][0].plain_text
                break;
            case "請求日":
                invoiceDetailInfo.date = row[1][0] !== undefined ? row[1][0].plain_text : Utilities.formatDate(newDate, "Asia/Tokyo", "yyyy/MM/dd")
                break;
            case "お支払い期限":
                invoiceDetailInfo.deadline = row[1][0] !== undefined ? row[1][0].plain_text : (newDate.getMonth() + 2).toString() + "月末日"
                break;
        }
    })

    // 勤怠情報を取得 (db/query)
    const attendanceTableId = datePageBlockList.find(block => block.type === "child_database")?.id
    const attendanceTable = postDbQueary({ headers, dbId: attendanceTableId ?? "" })
    const attendances: Attendance[] = attendanceTable.map(row => {
        const relationId = row.properties.業務内容.relation !== undefined ? row.properties.業務内容.relation[0].id : ""
        const businessTable: Page = getPage({ headers, pageId: relationId })
        const business = {
            summary: "",
            price: 0,
            unit: ""
        }
        business.summary = businessTable.properties.摘要.title ? businessTable.properties.摘要.title[0].plain_text : ""

        // TODO その他の時の処理
        if (business.summary === "その他") {
        } else {
            business.price = Number(businessTable.properties.単価.number)
            business.unit = businessTable.properties.単位.select?.name ?? ""
        }

        return {
            startDate: row.properties.勤務時間.date?.start,
            endDate: row.properties.勤務時間.date?.end,
            break: row.properties.休憩.number ?? 0,
            summary: business.summary,
            price: business.price,
            unit: business.unit
        } as Attendance
    })


    // 時間の計算
    const timeList: { summary: string, time: number, price: number, unit: string }[] = []
    attendances.forEach(attendance => {
        const diff = new Date(attendance.endDate).getTime() - new Date(attendance.startDate).getTime()
        let checkAry = { index: 0, check: false }
        timeList.forEach((timeRow, index) => {
            checkAry.check = timeRow.summary === attendance.summary
            checkAry.index = index
        })
        if (checkAry.check) {
            timeList[checkAry.index].time += (diff / (60 * 60 * 1000) - attendance.break)
        } else {
            timeList.push({ summary: attendance.summary, time: (diff / (60 * 60 * 1000)) - attendance.break, price: attendance.price, unit: attendance.unit })
        }
    })


    // スプレッドシートに書き出し
    const ss = SpreadsheetApp.openById(sheetId)
    const templateSheet = ss.getSheetByName("請求書テンプレ")
    const sheet = templateSheet?.copyTo(ss).setName(fmtDate + "請求書")

    sheet?.getRange("B4").setValue(invoiceBaseInfo.destination)
    sheet?.getRange("O5").setValue(invoiceBaseInfo.name)
    sheet?.getRange("O6").setValue(invoiceBaseInfo.zipCode)
    sheet?.getRange("O7").setValue(invoiceBaseInfo.address)
    sheet?.getRange("O8").setValue(invoiceBaseInfo.tel)
    sheet?.getRange("O10").setValue(invoiceBaseInfo.bank)
    sheet?.getRange("O11").setValue(invoiceBaseInfo.bankNumber)
    sheet?.getRange("O12").setValue(invoiceBaseInfo.bankName)

    sheet?.getRange("D8").setValue(invoiceDetailInfo.subject)
    sheet?.getRange("Q2").setValue(invoiceDetailInfo.no)
    sheet?.getRange("Q3").setValue(invoiceDetailInfo.date)
    sheet?.getRange("N14").setValue(invoiceDetailInfo.deadline)

    let subtotal: number = 0
    timeList.forEach((TimeRow, index) => {
        const rangeRowNo = index + 17
        sheet?.getRange("B" + rangeRowNo).setValue(index + 1)
        sheet?.getRange("C" + rangeRowNo).setValue(TimeRow.summary)
        sheet?.getRange("K" + rangeRowNo).setValue(TimeRow.time)
        sheet?.getRange("L" + rangeRowNo).setValue(TimeRow.unit)
        sheet?.getRange("M" + rangeRowNo).setValue(TimeRow.price)
        sheet?.getRange("P" + rangeRowNo).setValue(TimeRow.time * TimeRow.price)
        subtotal += TimeRow.time * TimeRow.price
    });

    sheet?.getRange("M22").setValue(subtotal)
    sheet?.getRange("M23").setValue(Math.ceil(subtotal * 0.1))
    sheet?.getRange("M28").setValue(0)
    sheet?.getRange("M29").setValue(subtotal + Math.ceil(subtotal * 0.1))
    sheet?.getRange("E14").setValue(subtotal + Math.ceil(subtotal * 0.1))

    // シートの再描画
    SpreadsheetApp.flush()

    // PDF化
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?`
    const exportOpts = {
        exportFormat: 'pdf',
        format: "pdf",
        size: "A4",
        portrait: "true",
        fitw: "true",
        docName: "false",
        printtitle: "false",
        pagenumbers: "false",
        gridlines: "false",
        fxr: "false",
        range: "A1%3AS36",
        top_margin: "0.5",
        right_margin: "0.2",
        left_margin: "0.2",
        bottom_margin: "0.5",
        horizontal_alignment: "CENTER",
        vertical_alignment: "CENTER",
        gid: sheet?.getSheetId()
    }
    const urlExt = [];
    for (const [key, value] of Object.entries(exportOpts)) {
        urlExt.push(key + "=" + value)
    }
    const options = urlExt.join("&")
    const pdfResponse = UrlFetchApp.fetch(exportUrl + options, {
        headers: {
            "Authorization": "Bearer " + ScriptApp.getOAuthToken()
        }
    })
    const blob = pdfResponse.getBlob().setName(`${Utilities.formatDate(newDate, "Asia/Tokyo", "MM")}月分_${invoiceBaseInfo.name}` + ".pdf")

    // GoogleDriveに保存
    const folder = DriveApp.getFolderById(folderId)
    folder.createFile(blob)

    // シートの削除
    ss.deleteSheet(sheet!)

    // PDFのURLをNotionに書き込み
}


// ====================
//  api
// ====================

interface postSearchProps {
    headers: {
        "content-type": string,
        "Authorization": string,
        "Notion-Version": string
    }
    payload: {
        query?: string
    }
}

interface getBlockChildrenProps {
    headers: {
        "content-type": string,
        "Authorization": string,
        "Notion-Version": string
    }
    blockId: string
}

interface postDbQuearyProps {
    headers: {
        "content-type": string,
        "Authorization": string,
        "Notion-Version": string
    }
    dbId: string
}

interface getPageProps {
    headers: {
        "content-type": string,
        "Authorization": string,
        "Notion-Version": string
    }
    pageId: string
}

const setHeaders = (token: string, notionVersion: string) => {
    return {
        'content-type': 'application/json; charset=UTF-8',
        'Authorization': 'Bearer ' + token,
        'Notion-Version': notionVersion,
    }
}

const postSearch = ({ headers, payload }: postSearchProps) => {
    const url = "https://api.notion.com/v1/search"
    const options = {
        method: 'post' as GoogleAppsScript.URL_Fetch.HttpMethod,
        headers,
        payload: JSON.stringify(payload)
    }
    const res: SearchRes = JSON.parse(UrlFetchApp.fetch(url, options).getContentText())
    return res.results
}

const getBlockChildren = ({ headers, blockId }: getBlockChildrenProps) => {
    const url = `https://api.notion.com/v1/blocks/${blockId}/children`
    const options = {
        method: "get" as GoogleAppsScript.URL_Fetch.HttpMethod,
        headers
    }
    const res: BlockChildrenRes = JSON.parse(UrlFetchApp.fetch(url, options).getContentText())
    return res.results
}

const postDbQueary = ({ headers, dbId }: postDbQuearyProps) => {
    const url = `https://api.notion.com/v1/databases/${dbId}/query`
    const options = {
        method: 'post' as GoogleAppsScript.URL_Fetch.HttpMethod,
        headers
    }
    const res: DatabaseRes = JSON.parse(UrlFetchApp.fetch(url, options).getContentText())
    return res.results
}

const getPage = ({ headers, pageId }: getPageProps) => {
    const url = `https://api.notion.com/v1/pages/${pageId}`
    const options = {
        method: "get" as GoogleAppsScript.URL_Fetch.HttpMethod,
        headers
    }
    const res: Page = JSON.parse(UrlFetchApp.fetch(url, options).getContentText())
    return res
}